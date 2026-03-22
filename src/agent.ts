#!/usr/bin/env bun
/**
 *  Ghost — the anti-ghosting iMessage agent.
 *
 *  Catches you before you ghost someone.
 *  Drafts replies in YOUR voice so responding takes 2 seconds.
 *  Tracks your relationship health over time.
 *
 *  Usage:
 *    1. cp .env.example .env && fill in your details
 *    2. Grant Full Disk Access to your terminal
 *    3. bun install
 *    4. bun run src/agent.ts
 */

import { IMessageSDK, Reminders } from "@photon-ai/imessage-kit";
import { scanForGhosted, markNudged } from "./scanner.js";
import { draftReplies, buildNudge } from "./drafter.js";
import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import {
  loadTracker,
  saveTracker,
  recordNudge,
  recordReply,
  generateReport,
  bootstrapTracker,
} from "./tracker.js";
import { captureDump, getDumpSummary, markDumpDone, clearDoneDumps } from "./dump.js";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ── Config ──────────────────────────────────────────────────────────────

const MY_PHONE = process.env.MY_PHONE;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const THRESHOLD = parseInt(process.env.GHOST_THRESHOLD_MINUTES ?? "60", 10);
const SCAN_INTERVAL = parseInt(process.env.SCAN_INTERVAL_MINUTES ?? "15", 10);

if (!MY_PHONE) {
  console.error("\n  Set MY_PHONE in .env (your iMessage phone number)\n");
  process.exit(1);
}
if (!GROQ_API_KEY) {
  console.error("\n  Set GROQ_API_KEY in .env (get one free at console.groq.com)\n");
  process.exit(1);
}

// ── State ───────────────────────────────────────────────────────────────

interface PendingNudge {
  sender: string;
  senderName: string | null;
  chatId: string;
  drafts: { casual: string; warm: string; brief: string };
  nudgedAt: number;
  minutesAgo: number;
}

const DATA_DIR = join(import.meta.dir, "..", "data");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

import { readFileSync, writeFileSync } from "node:fs";
const PENDING_PATH = join(DATA_DIR, "pending.json");

function loadPending(): PendingNudge[] {
  ensureDataDir();
  if (!existsSync(PENDING_PATH)) return [];
  try {
    return JSON.parse(readFileSync(PENDING_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function savePending(pending: PendingNudge[]) {
  ensureDataDir();
  writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2));
}

// ── Boot ────────────────────────────────────────────────────────────────

console.log(`
    ╔═══════════════════════════════════════╗
    ║    Ghost — Anti-Ghosting Agent        ║
    ║    Stop ghosting. Start replying.     ║
    ╚═══════════════════════════════════════╝
`);

const sdk = new IMessageSDK({
  debug: false,
  watcher: {
    excludeOwnMessages: false, // We NEED to see our own messages (commands like "1", "ghost later")
  },
});
const reminders = new Reminders(sdk);
const tracker = loadTracker();
let pending = loadPending();

// Track messages Ghost sends so it doesn't process its own output
const recentGhostMessages = new Set<string>();

/** Send a message as Ghost and track it to prevent self-loops */
async function ghostSend(to: string, message: string) {
  recentGhostMessages.add(message);
  // Keep the set from growing forever — clear old entries after 60s
  setTimeout(() => recentGhostMessages.delete(message), 60_000);
  await sdk.send(to, message);
}

// Clear stale pending nudges from previous sessions — context is lost on restart
if (pending.length > 0) {
  console.log(`  Clearing ${pending.length} stale pending nudge(s) from last session`);
  pending = [];
  savePending(pending);
}

console.log(`  Phone:      ${MY_PHONE}`);
console.log(`  Threshold:  ${THRESHOLD} minutes`);
console.log(`  Scan every: ${SCAN_INTERVAL} minutes`);
console.log(`  Contacts:   ${Object.keys(tracker.contacts).length} tracked`);
console.log(`  Status:     Booting...\n`);

// Bootstrap tracker with existing message history
console.log(`  Analyzing message history...`);
await bootstrapTracker(sdk, tracker);
console.log(`  Tracking ${Object.keys(tracker.contacts).length} contacts`);
console.log(`  Listening for messages...\n`);

// ── Ghost scan loop ─────────────────────────────────────────────────────

// Queue of ghosted messages waiting to be nudged (one at a time)
let nudgeQueue: import("./scanner.js").GhostedMessage[] = [];

/** Send the NEXT nudge from the queue — only if no pending nudge is waiting for a reply */
async function sendNextNudge() {
  // Don't send a new nudge if we're still waiting for a reply to the last one
  if (pending.length > 0) return;
  if (nudgeQueue.length === 0) return;

  const ghost = nudgeQueue.shift()!;
  const name = ghost.senderName || ghost.sender;

  try {
    // Re-verify this person is STILL ghosted (user might have replied manually since queued)
    const stillGhosted = await scanForGhosted(sdk, 0, MY_PHONE);
    const stillNeeded = stillGhosted.some(
      (g) => g.sender === ghost.sender
    );
    if (!stillNeeded) {
      console.log(`    ${name} — already replied, skipping`);
      // Try next in queue
      await sendNextNudge();
      return;
    }

    // Draft AI replies in the user's voice
    const drafts = await draftReplies(sdk, ghost, ghost.priority);

    // Build and send the nudge
    const nudge = buildNudge(ghost, drafts, ghost.priority);
    await ghostSend(MY_PHONE!, nudge);

    // Track everything
    markNudged(ghost.sender, ghost.receivedAt);
    recordNudge(tracker, ghost.sender, ghost.senderName);

    // Save as pending — wait for user to respond before sending next
    pending.push({
      sender: ghost.sender,
      senderName: ghost.senderName,
      chatId: ghost.chatId,
      drafts,
      nudgedAt: Date.now(),
      minutesAgo: ghost.minutesAgo,
    });
    savePending(pending);

    const remaining = nudgeQueue.length;
    const queueMsg = remaining > 0 ? ` (${remaining} more in queue)` : "";
    console.log(`    Nudge sent for ${name}${queueMsg}`);
  } catch (err) {
    console.error(`  Failed to nudge about ${name}:`, err);
  }
}

async function runScan() {
  try {
    const ghosted = await scanForGhosted(sdk, THRESHOLD, MY_PHONE);

    if (ghosted.length === 0) {
      console.log(
        `  [${new Date().toLocaleTimeString()}] Scan: all clear`
      );
      return;
    }

    // Sort by priority — urgent first
    ghosted.sort((a, b) => {
      const order = { urgent: 0, normal: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });

    console.log(
      `  [${new Date().toLocaleTimeString()}] Found ${ghosted.length} ghosted message(s)`
    );

    for (const ghost of ghosted) {
      const name = ghost.senderName || ghost.sender;
      const tag = ghost.priority === "urgent" ? " [URGENT]" : ghost.priority === "low" ? " [low]" : "";
      console.log(`    ${name} (${ghost.minutesAgo}m)${tag} — ${ghost.priorityReason}`);
    }

    // Add to queue — skip anyone already queued or pending
    const queuedSenders = new Set(nudgeQueue.map((g) => g.sender));
    const pendingSenders = new Set(pending.map((p) => p.sender));
    const newGhosts = ghosted.filter(
      (g) => !queuedSenders.has(g.sender) && !pendingSenders.has(g.sender)
    );

    if (newGhosts.length > 0) {
      nudgeQueue.push(...newGhosts);
      await sendNextNudge();
    }
  } catch (err) {
    console.error(`  [${new Date().toLocaleTimeString()}] Scan error:`, err);
  }
}

// Initial scan after 10 seconds
setTimeout(runScan, 10_000);

// Recurring scans
const scanTimer = setInterval(runScan, SCAN_INTERVAL * 60 * 1000);

// ── Accountability check-ins ────────────────────────────────────────

/**
 * Proactive check-ins that Ghost sends without being asked.
 * - Idle alert: if you haven't replied to anyone in 3+ hours
 * - Streak nudge: when you're about to break a reply streak
 * - Evening summary: daily recap at 9pm
 */

let lastCheckinTime = 0;

async function runAccountabilityCheck() {
  try {
    const now = new Date();
    const hour = now.getHours();

    // Evening summary at 9pm (only once per day)
    const todayKey = now.toISOString().slice(0, 10);
    const lastCheckinDate = new Date(lastCheckinTime).toISOString().slice(0, 10);

    if (hour === 21 && todayKey !== lastCheckinDate) {
      lastCheckinTime = Date.now();

      const ghosted = await scanForGhosted(sdk, 0, MY_PHONE);
      const contacts = Object.values(tracker.contacts);
      const todayStats = tracker.dailyStats[todayKey] ?? { replied: 0, ghosted: 0, nudged: 0 };

      let evening = "daily check-in:\n\n";

      if (todayStats.replied > 0 || todayStats.nudged > 0) {
        evening += `today: ${todayStats.replied} replied, ${todayStats.ghosted} ghosted\n`;
      }

      if (ghosted.length > 0) {
        evening += `\n${ghosted.length} still waiting on you:\n`;
        ghosted.slice(0, 3).forEach((g) => {
          const name = g.senderName || g.sender;
          evening += `  - ${name} (${g.minutesAgo > 60 ? Math.round(g.minutesAgo / 60) + "hr" : g.minutesAgo + "m"} ago)\n`;
        });
      } else {
        evening += "\nno one's waiting on you. clean slate.";
      }

      // Streak callouts
      const activeStreaks = contacts.filter((c) => c.streak >= 3);
      if (activeStreaks.length > 0) {
        evening += `\nstreaks going:\n`;
        activeStreaks.forEach((c) => {
          evening += `  ${c.name} - ${c.streak} days\n`;
        });
      }

      await ghostSend(MY_PHONE!, evening);
      console.log(`  [${now.toLocaleTimeString()}] Evening check-in sent`);
    }

    // Idle alert: if there are 3+ unreplied messages and it's been 2+ hours since last nudge
    if (hour >= 9 && hour <= 22) {
      const ghosted = await scanForGhosted(sdk, 120, MY_PHONE); // 2hr+ unreplied
      if (ghosted.length >= 3 && pending.length === 0 && nudgeQueue.length === 0) {
        const names = ghosted.slice(0, 3).map((g) => g.senderName || g.sender).join(", ");
        await ghostSend(MY_PHONE!, `heads up - ${ghosted.length} people waiting on you (${names}). want me to help? text ghost scan`);
        console.log(`  [${now.toLocaleTimeString()}] Idle alert sent`);
      }
    }
  } catch (err) {
    console.error(`  Accountability check error:`, err);
  }
}

// Run accountability check every 30 minutes
const accountabilityTimer = setInterval(runAccountabilityCheck, 30 * 60 * 1000);

// ── Watch for reply choices + commands ──────────────────────────────────

await sdk.startWatching({
  onMessage: async (msg) => {
    // Only process our own messages (replies to Ghost's nudges)
    if (!msg.isFromMe) return;
    if (!msg.text) return;

    const text = msg.text.trim();
    const lower = text.toLowerCase();

    // Ignore Ghost's own output — if we recently sent this exact text, skip it
    if (recentGhostMessages.has(text)) return;

    // Also catch common Ghost output patterns
    if (text.startsWith("You're ghosting")) return;
    if (text.includes("Quick replies:")) return;
    if (text.includes("Reply 1, 2, or 3")) return;
    if (text.startsWith("Ghost Report")) return;
    if (text.startsWith("Ghost commands:")) return;
    if (text.startsWith("(Snoozed reminder)")) return;
    if (text.startsWith("Snoozed ")) return;
    if (text.startsWith("Skipped ")) return;

    // ── Reply choices: 1, 2, or 3 ────────────────────────────────

    if ((text === "1" || text === "2" || text === "3") && pending.length > 0) {
      const nudge = pending[0];
      const choice =
        text === "1"
          ? nudge.drafts.casual
          : text === "2"
            ? nudge.drafts.warm
            : nudge.drafts.brief;

      try {
        await sdk.send(nudge.sender, choice);
        const name = nudge.senderName || nudge.sender;
        console.log(`  Replied to ${name}: "${choice.slice(0, 50)}..."`);

        // Track the reply
        recordReply(tracker, nudge.sender, nudge.minutesAgo);

        pending.shift();
        savePending(pending);

        // Send next nudge from queue (now that this one is handled)
        setTimeout(() => sendNextNudge(), 2000);
      } catch (err) {
        console.error(`  Failed to send reply:`, err);
      }
      return;
    }

    // ── Commands ─────────────────────────────────────────────────

    if (lower === "ghost status") {
      const ghosted = await scanForGhosted(sdk, 0, MY_PHONE);
      const status =
        ghosted.length === 0
          ? "All clear — nobody's waiting on you."
          : `${ghosted.length} unreplied:\n${ghosted
              .map((g) => {
                const name = g.senderName || g.sender;
                const tag = g.priority === "urgent" ? " !!" : "";
                return `- ${name}${tag} (${g.minutesAgo}m): "${g.text.slice(0, 40)}..."`;
              })
              .join("\n")}`;
      await ghostSend(MY_PHONE!, status);
      return;
    }

    if (lower === "ghost scan") {
      await ghostSend(MY_PHONE!, "Scanning...");
      await runScan();
      return;
    }

    // ghost skip = snooze 30min (safe default — comes back later)
    if (lower === "ghost skip" || lower === "ghost later") {
      if (pending.length > 0) {
        const snoozed = pending.shift()!;
        savePending(pending);
        const name = snoozed.senderName || snoozed.sender;
        const snoozeMs = 30 * 60 * 1000;
        await ghostSend(MY_PHONE!, `Skipped ${name} for now. I'll nudge you again in 30 min.`);

        setTimeout(async () => {
          try {
            const nudge = buildNudge(
              {
                sender: snoozed.sender,
                senderName: snoozed.senderName,
                text: "(snoozed)",
                chatId: snoozed.chatId,
                receivedAt: new Date(snoozed.nudgedAt),
                minutesAgo: snoozed.minutesAgo + 30,
                priority: "normal",
                priorityReason: "snoozed reminder",
              },
              snoozed.drafts,
              "normal"
            );
            await ghostSend(MY_PHONE!, `(Reminder)\n\n${nudge}`);
            pending.push(snoozed);
            savePending(pending);
          } catch {}
        }, snoozeMs);

        setTimeout(() => sendNextNudge(), 2000);
      } else {
        await ghostSend(MY_PHONE!, "Nothing to skip.");
      }
      return;
    }

    // ghost dismiss = permanent skip (intentional ghosting)
    if (lower === "ghost dismiss") {
      if (pending.length > 0) {
        const dismissed = pending.shift()!;
        savePending(pending);
        await ghostSend(MY_PHONE!, `Dismissed ${dismissed.senderName || dismissed.sender} permanently.`);
        setTimeout(() => sendNextNudge(), 2000);
      } else {
        await ghostSend(MY_PHONE!, "Nothing to dismiss.");
      }
      return;
    }

    // ghost snooze [duration] = custom snooze time
    if (lower.startsWith("ghost snooze")) {
      if (pending.length > 0) {
        const snoozed = pending.shift()!;
        savePending(pending);

        // Parse optional duration: "ghost snooze 1h", "ghost snooze 15m", default 30m
        const durationMatch = lower.match(/(\d+)\s*(m|min|h|hr|hour)/i);
        let snoozeMs = 30 * 60 * 1000; // default 30 min
        let snoozeLabel = "30 min";
        if (durationMatch) {
          const num = parseInt(durationMatch[1]);
          const unit = durationMatch[2].startsWith("h") ? "hour" : "min";
          snoozeMs = unit === "hour" ? num * 60 * 60 * 1000 : num * 60 * 1000;
          snoozeLabel = `${num} ${unit === "hour" ? "hr" : "min"}`;
        }

        const name = snoozed.senderName || snoozed.sender;
        await ghostSend(MY_PHONE!, `Snoozed ${name} for ${snoozeLabel}. I'll nudge you again.`);

        // Re-queue the nudge after the snooze period
        setTimeout(async () => {
          try {
            const nudge = buildNudge(
              {
                sender: snoozed.sender,
                senderName: snoozed.senderName,
                text: "(snoozed)",
                chatId: snoozed.chatId,
                receivedAt: new Date(snoozed.nudgedAt),
                minutesAgo: snoozed.minutesAgo + Math.round(snoozeMs / 60000),
                priority: "normal",
                priorityReason: "snoozed reminder",
              },
              snoozed.drafts,
              "normal"
            );
            await ghostSend(MY_PHONE!, `(Snoozed reminder)\n\n${nudge}`);
            pending.push(snoozed);
            savePending(pending);
            console.log(`  Snoozed nudge for ${name} re-delivered`);
          } catch (err) {
            console.error(`  Snooze re-delivery failed:`, err);
          }
        }, snoozeMs);

        setTimeout(() => sendNextNudge(), 2000);
      } else {
        await ghostSend(MY_PHONE!, "Nothing to snooze.");
      }
      return;
    }

    if (lower === "ghost report") {
      const report = generateReport(tracker);
      await ghostSend(MY_PHONE!, report);
      return;
    }

    if (lower === "ghost help") {
      await sdk.send(
        MY_PHONE!,
        [
          "Ghost commands:",
          "",
          "ghost status — see unreplied messages",
          "ghost scan — force a scan now",
          "ghost report — your relationship health report",
          "ghost skip / later — snooze 30min",
          "ghost snooze 1h — custom snooze",
          "ghost dismiss — skip permanently",
          "ghost text [name/number] — draft a message to someone",
          "ghost dump — see your brain dump",
          "ghost done [text] — mark a dump item done",
          "ghost help — this message",
          "",
          "Reply 1, 2, or 3 to send a draft.",
          "Or just talk to me — I understand context.",
        ].join("\n")
      );
      return;
    }

    // ── Brain dump commands ────────────────────────────────────

    if (lower === "ghost dump" || lower === "ghost brain") {
      const summary = getDumpSummary();
      await ghostSend(MY_PHONE!, summary);
      return;
    }

    if (lower.startsWith("ghost done ")) {
      const query = text.slice(11).trim();
      const done = markDumpDone(query);
      if (done) {
        await ghostSend(MY_PHONE!, `done: ${done.text}`);
      } else {
        await ghostSend(MY_PHONE!, "couldn't find that one.");
      }
      return;
    }

    if (lower === "ghost clear done") {
      const count = clearDoneDumps();
      await ghostSend(MY_PHONE!, `cleared ${count} completed items.`);
      return;
    }

    // ── Proactive messaging: "ghost text [name/number]" ────────

    if (lower.startsWith("ghost text ") || lower.startsWith("ghost msg ")) {
      const target = text.replace(/^ghost\s+(text|msg)\s+/i, "").trim();
      if (!target) {
        await ghostSend(MY_PHONE!, "who do you want to text? give me a name or number.");
        return;
      }

      // Try to find this contact in our tracker or chats
      let recipientPhone = target;
      let recipientName = target;

      // If it's not a phone number, search tracker contacts by name
      if (!/^\+?\d{7,}$/.test(target.replace(/\D/g, ""))) {
        const contacts = Object.values(tracker.contacts);
        const match = contacts.find(
          (c) => c.name.toLowerCase().includes(target.toLowerCase())
        );
        if (match) {
          recipientPhone = match.phone;
          recipientName = match.name;
        } else {
          await ghostSend(MY_PHONE!, `can't find "${target}" in your contacts. try a phone number instead.`);
          return;
        }
      }

      // Get conversation context for voice matching
      const context = await sdk.getMessages({
        sender: recipientPhone,
        limit: 15,
        since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      const recentConvo = context.messages
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(-10)
        .map((m) => `${m.isFromMe ? "You" : recipientName}: ${m.text || "(attachment)"}`)
        .join("\n");

      // Get user's voice from past messages
      const myMsgs = context.messages
        .filter((m) => m.isFromMe && m.text && m.text.length > 5)
        .map((m) => m.text!)
        .slice(-10);

      const voiceContext = myMsgs.length > 0
        ? `User's texting style:\n${myMsgs.map((m) => `- "${m}"`).join("\n")}`
        : "";

      try {
        const { text: drafts } = await generateText({
          model: groq("llama-3.3-70b-versatile"),
          system: `Draft 3 message options for the user to send to ${recipientName}. These should be conversation starters or follow-ups based on recent context.

${voiceContext || "Default to casual, natural texting."}

RULES:
- Match the user's texting style from the examples
- Keep each option 1-2 sentences max
- Make them natural, not forced
- If there's recent conversation context, reference it naturally
- If no context, make it a casual check-in

FORMAT (exactly 3 lines):
CASUAL: [relaxed opener]
WARM: [friendly, engaged]
BRIEF: [shortest possible]`,
          prompt: recentConvo
            ? `Recent conversation:\n${recentConvo}\n\nDraft 3 messages to send to ${recipientName}:`
            : `Draft 3 messages to send to ${recipientName} (no recent context):`,
          temperature: 0.8,
          maxTokens: 300,
        });

        const lines = drafts.split("\n").filter((l) => l.trim());
        const casual = lines.find((l) => l.startsWith("CASUAL:"))?.replace("CASUAL:", "").trim() ?? `hey ${recipientName.split(" ")[0].toLowerCase()}!`;
        const warm = lines.find((l) => l.startsWith("WARM:"))?.replace("WARM:", "").trim() ?? `hey! how's it going?`;
        const brief = lines.find((l) => l.startsWith("BRIEF:"))?.replace("BRIEF:", "").trim() ?? `yo`;

        const nudgeMsg = [
          `text ${recipientName}:`,
          ``,
          `1. ${casual}`,
          `2. ${warm}`,
          `3. ${brief}`,
          ``,
          `reply 1, 2, or 3 to send.`,
        ].join("\n");

        await ghostSend(MY_PHONE!, nudgeMsg);

        // Save as pending so 1/2/3 works
        pending.push({
          sender: recipientPhone,
          senderName: recipientName,
          chatId: "",
          drafts: { casual, warm, brief },
          nudgedAt: Date.now(),
          minutesAgo: 0,
        });
        savePending(pending);
        console.log(`  Proactive text drafted for ${recipientName}`);
      } catch (err) {
        console.error(`  Draft error:`, err);
        await ghostSend(MY_PHONE!, "couldn't draft that. try again?");
      }
      return;
    }

    // ── Conversational mode ─────────────────────────────────────

    if (lower.startsWith("ghost ")) {
      await handleChat(text);
      return;
    }

    // ── Brain dump catch-all ────────────────────────────────────
    // Any self-text that isn't a command or reply choice = brain dump
    // Ghost catches it, categorizes it, optionally sets a reminder

    if (text.length > 2) {
      const { confirmation, reminderMs, entry } = await captureDump(text);
      await ghostSend(MY_PHONE!, confirmation);
      console.log(`  Dump: "${text.slice(0, 40)}..." → ${entry.category}`);

      // Set up reminder if one was detected
      if (reminderMs) {
        setTimeout(async () => {
          try {
            await ghostSend(MY_PHONE!, `reminder: ${entry.text}`);
            console.log(`  Reminder fired: ${entry.text}`);
          } catch {}
        }, reminderMs);
      }
    }
  },
});

/** Handle natural conversation with Ghost */
async function handleChat(userMessage: string) {
  try {
    // Build context from tracker data
    const contacts = Object.values(tracker.contacts);
    const totalReceived = contacts.reduce((s, c) => s + c.totalReceived, 0);
    const totalReplied = contacts.reduce((s, c) => s + c.totalReplied, 0);
    const replyRate = totalReceived > 0 ? Math.round((totalReplied / totalReceived) * 100) : 100;

    const topGhosted = [...contacts]
      .filter(c => c.totalGhosted > 0)
      .sort((a, b) => b.totalGhosted - a.totalGhosted)
      .slice(0, 5)
      .map(c => `${c.name}: ghosted ${c.totalGhosted}x, avg reply ${c.avgReplyMinutes}min, ${c.streak}-day streak`)
      .join("\n");

    const ghostedNow = await scanForGhosted(sdk, 0, MY_PHONE);
    const unrepliedSummary = ghostedNow.length === 0
      ? "No unreplied messages right now."
      : ghostedNow.map(g => `${g.senderName || g.sender} (${g.minutesAgo}m ago): "${g.text.slice(0, 50)}"`).join("\n");

    const pendingSummary = pending.length > 0
      ? `Waiting for reply choice on: ${pending[0].senderName || pending[0].sender}`
      : "No pending nudges.";

    const { text: reply } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      system: `You are Ghost, an anti-ghosting iMessage agent. You help the user stay on top of their text messages and maintain relationships. You're warm, direct, and concise — like a friend who keeps it real. Keep replies SHORT (2-4 sentences max, this is iMessage).

You have access to this data about the user:

REPLY RATE: ${replyRate}%
TOTAL CONTACTS TRACKED: ${contacts.length}

TOP GHOSTED CONTACTS:
${topGhosted || "None yet"}

CURRENTLY UNREPLIED:
${unrepliedSummary}

PENDING NUDGE:
${pendingSummary}

QUEUE: ${nudgeQueue.length} more nudges waiting

Answer their question using this data. Be conversational, not robotic. If they ask about specific people, use the data. If they ask for advice, be supportive — remember this is for people with ADHD who struggle with executive dysfunction. Never guilt-trip.`,
      prompt: userMessage,
      temperature: 0.7,
      maxTokens: 300,
    });

    await ghostSend(MY_PHONE!, reply);
    console.log(`  Chat: "${userMessage.slice(0, 40)}..." → "${reply.slice(0, 50)}..."`);
  } catch (err) {
    console.error(`  Chat error:`, err);
    await ghostSend(MY_PHONE!, "Sorry, brain glitch. Try again?");
  }
}

// ── Graceful shutdown ───────────────────────────────────────────────────

process.on("SIGINT", async () => {
  console.log("\n  Shutting down Ghost...");
  clearInterval(scanTimer);
  clearInterval(accountabilityTimer);
  reminders.destroy();
  sdk.stopWatching();
  await sdk.close();
  saveTracker(tracker);
  console.log("  Goodbye.\n");
  process.exit(0);
});
