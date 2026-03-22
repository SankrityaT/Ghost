/**
 * Ghost Scanner
 * Finds messages you've been ghosting — unreplied DMs that are aging out.
 * Uses the iMessage Kit's getUnreadMessages() API for efficient scanning.
 */

import { IMessageSDK } from "@photon-ai/imessage-kit";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { detectPriority, type Priority } from "./priority.js";

export interface GhostedMessage {
  sender: string;
  senderName: string | null;
  text: string;
  chatId: string;
  receivedAt: Date;
  minutesAgo: number;
  priority: Priority;
  priorityReason: string;
}

const DATA_DIR = join(import.meta.dir, "..", "data");
const NUDGED_PATH = join(DATA_DIR, "nudged.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

/** Track which messages we've already nudged about (by sender + date) */
function loadNudged(): Record<string, string> {
  ensureDataDir();
  if (!existsSync(NUDGED_PATH)) return {};
  return JSON.parse(readFileSync(NUDGED_PATH, "utf-8"));
}

function saveNudged(nudged: Record<string, string>) {
  ensureDataDir();
  writeFileSync(NUDGED_PATH, JSON.stringify(nudged, null, 2));
}

function nudgeKey(sender: string, _messageDate: Date): string {
  // One nudge per sender per day — don't nag about the same person twice
  const today = new Date().toISOString().slice(0, 10);
  return `${sender}::${today}`;
}

/**
 * Detect automated/promotional messages that don't need replies.
 */
function isAutomatedMessage(sender: string, text: string): boolean {
  // Short codes: any sender that's just digits and 6 or fewer characters
  const digitsOnly = sender.replace(/\D/g, "");
  if (digitsOnly.length <= 6 && digitsOnly.length >= 4) {
    return true;
  }

  // Verification/OTP codes
  if (/\b(?:verification|verify|code|otp|pin)\b.*\b\d{4,8}\b/i.test(text)) return true;
  if (/\b\d{4,8}\b.*\b(?:verification|verify|code|otp|pin)\b/i.test(text)) return true;

  // Common automated message patterns
  if (/\b(?:do not reply|no-reply|noreply|unsubscribe|opt.?out|stop to (?:cancel|end)|reply stop)\b/i.test(text)) return true;

  // Brand name + colon at start (e.g., "FragranceNet:", "Amazon:", "Uber:")
  if (/^[A-Z][A-Za-z0-9]+:\s/i.test(text)) return true;

  // Promotional patterns
  if (/\b(?:limited time|act now|exclusive offer|order confirm|shipping update|tracking number|delivered your|celebrate|% off|\bsale\b|free shipping|shop now|use code|promo|coupon|discount)\b/i.test(text)) return true;

  // Two-factor auth
  if (/\b(?:2fa|two.?factor|sign.?in|log.?in)\b.*\b\d{4,8}\b/i.test(text)) return true;

  // Messages from email addresses (automated services)
  if (/^[^@]+@[^@]+\.[^@]+$/.test(sender)) return true;

  // Hashtag-heavy messages (promotional)
  if ((text.match(/#\w+/g) || []).length >= 2) return true;

  return false;
}

/**
 * Scan for ghosted messages using iMessage Kit's getMessages API.
 * Finds all unreplied DMs, filters out spam/promo, detects urgency.
 */
export async function scanForGhosted(
  sdk: IMessageSDK,
  thresholdMinutes: number,
  myPhone?: string
): Promise<GhostedMessage[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const nudged = loadNudged();

  // Use getUnreadMessages() for efficient unread detection
  const unread = await sdk.getUnreadMessages();
  // Also get recent messages for full context
  const recent = await sdk.getMessages({ limit: 300, since });

  // Group recent messages by chat for context
  const chatMessages = new Map<string, typeof recent.messages>();
  for (const msg of recent.messages) {
    const existing = chatMessages.get(msg.chatId) ?? [];
    existing.push(msg);
    chatMessages.set(msg.chatId, existing);
  }

  const ghosted: GhostedMessage[] = [];

  for (const [chatId, messages] of chatMessages) {
    // Skip group chats — focus on DMs
    if (messages[0]?.isGroupChat) continue;

    // Sort by date ascending
    messages.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Find our last reply in this chat
    let lastReplyIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].isFromMe) {
        lastReplyIdx = i;
        break;
      }
    }

    // Get all messages from them AFTER our last reply
    const unrepliedMsgs = messages
      .slice(lastReplyIdx + 1)
      .filter(
        (m) =>
          !m.isFromMe &&
          !m.isReaction &&
          m.text &&
          m.text.trim().length > 0
      );

    if (unrepliedMsgs.length === 0) continue;

    const firstUnreplied = unrepliedMsgs[0];
    const lastMsg = unrepliedMsgs[unrepliedMsgs.length - 1];

    // Skip self-messages
    if (
      myPhone &&
      lastMsg.sender.replace(/\D/g, "") === myPhone.replace(/\D/g, "")
    )
      continue;

    // Skip automated/promotional messages
    if (isAutomatedMessage(lastMsg.sender, lastMsg.text!)) continue;

    // Detect priority from ALL unreplied messages (most urgent wins)
    let bestPriority: ReturnType<typeof detectPriority> = {
      priority: "low" as const,
      reason: "general message",
      thresholdMultiplier: 3,
    };
    for (const m of unrepliedMsgs) {
      const p = detectPriority(m.text!);
      if (p.thresholdMultiplier < bestPriority.thresholdMultiplier) {
        bestPriority = p;
      }
    }
    const { priority, reason, thresholdMultiplier } = bestPriority;
    const adjustedThreshold = thresholdMinutes * thresholdMultiplier;

    // Check if the FIRST unreplied message is old enough
    const minutesAgo =
      (Date.now() - firstUnreplied.date.getTime()) / (1000 * 60);
    if (minutesAgo < adjustedThreshold) continue;

    // Check if we already nudged about this sender today
    const key = nudgeKey(lastMsg.sender, lastMsg.date);
    if (nudged[key]) continue;

    // Build display text showing all unreplied messages
    const displayText =
      unrepliedMsgs.length === 1
        ? lastMsg.text!
        : unrepliedMsgs.map((m) => m.text!).join(" → ");

    ghosted.push({
      sender: lastMsg.sender,
      senderName: lastMsg.senderName,
      text: displayText,
      chatId,
      receivedAt: firstUnreplied.date,
      minutesAgo: Math.round(minutesAgo),
      priority,
      priorityReason: reason,
    });
  }

  return ghosted;
}

/** Mark a message as nudged so we don't nag about it again */
export function markNudged(sender: string, receivedAt: Date) {
  const nudged = loadNudged();
  nudged[nudgeKey(sender, receivedAt)] = new Date().toISOString();

  // Clean up entries older than 48 hours
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  for (const [key, timestamp] of Object.entries(nudged)) {
    if (new Date(timestamp).getTime() < cutoff) {
      delete nudged[key];
    }
  }

  saveNudged(nudged);
}
