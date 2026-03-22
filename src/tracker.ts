/**
 * Ghost Tracker
 * Tracks response patterns, relationship health, and generates
 * your Ghost Score — a report card for how well you're keeping up
 * with the people who matter.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IMessageSDK } from "@photon-ai/imessage-kit";

const DATA_DIR = join(import.meta.dir, "..", "data");
const TRACKER_PATH = join(DATA_DIR, "tracker.json");

export interface ContactStats {
  name: string;
  phone: string;
  totalReceived: number;
  totalReplied: number;
  totalGhosted: number;
  avgReplyMinutes: number;
  lastGhosted: string | null; // ISO date
  lastContact: string | null; // ISO date
  nudgeCount: number; // how many times Ghost nudged you about them
  streak: number; // consecutive days you replied to them
}

export interface TrackerData {
  contacts: Record<string, ContactStats>;
  dailyStats: Record<string, { ghosted: number; replied: number; nudged: number }>;
  startedAt: string;
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function loadTracker(): TrackerData {
  ensureDataDir();
  if (!existsSync(TRACKER_PATH)) {
    return { contacts: {}, dailyStats: {}, startedAt: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(TRACKER_PATH, "utf-8"));
}

export function saveTracker(tracker: TrackerData) {
  ensureDataDir();
  writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureContact(tracker: TrackerData, phone: string, name?: string | null): ContactStats {
  if (!tracker.contacts[phone]) {
    tracker.contacts[phone] = {
      name: name || phone,
      phone,
      totalReceived: 0,
      totalReplied: 0,
      totalGhosted: 0,
      avgReplyMinutes: 0,
      lastGhosted: null,
      lastContact: null,
      nudgeCount: 0,
      streak: 0,
    };
  }
  if (name && name !== phone) {
    tracker.contacts[phone].name = name;
  }
  return tracker.contacts[phone];
}

function ensureDay(tracker: TrackerData): { ghosted: number; replied: number; nudged: number } {
  const d = today();
  if (!tracker.dailyStats[d]) {
    tracker.dailyStats[d] = { ghosted: 0, replied: 0, nudged: 0 };
  }
  return tracker.dailyStats[d];
}

/** Record that Ghost nudged you about someone */
export function recordNudge(tracker: TrackerData, phone: string, name?: string | null) {
  const contact = ensureContact(tracker, phone, name);
  contact.nudgeCount++;
  contact.totalReceived++;
  contact.lastGhosted = new Date().toISOString();
  const day = ensureDay(tracker);
  day.nudged++;
  saveTracker(tracker);
}

/** Record that you replied (via Ghost or on your own) */
export function recordReply(tracker: TrackerData, phone: string, replyMinutes: number) {
  const contact = ensureContact(tracker, phone);
  contact.totalReplied++;
  contact.lastContact = new Date().toISOString();

  // Running average of reply time
  const total = contact.avgReplyMinutes * (contact.totalReplied - 1) + replyMinutes;
  contact.avgReplyMinutes = Math.round(total / contact.totalReplied);

  // Update streak
  contact.streak++;

  const day = ensureDay(tracker);
  day.replied++;
  saveTracker(tracker);
}

/** Record a ghost (you didn't reply even after nudge) */
export function recordGhost(tracker: TrackerData, phone: string) {
  const contact = ensureContact(tracker, phone);
  contact.totalGhosted++;
  contact.streak = 0; // broken
  const day = ensureDay(tracker);
  day.ghosted++;
  saveTracker(tracker);
}

/**
 * Generate the Ghost Report — your relationship health card.
 */
export function generateReport(tracker: TrackerData): string {
  const contacts = Object.values(tracker.contacts);

  if (contacts.length === 0) {
    return "No data yet. Ghost needs a few days of watching your messages to build your report.";
  }

  // Overall score (0-100)
  const totalReceived = contacts.reduce((s, c) => s + c.totalReceived, 0);
  const totalReplied = contacts.reduce((s, c) => s + c.totalReplied, 0);
  const replyRate = totalReceived > 0 ? Math.round((totalReplied / totalReceived) * 100) : 100;

  // Ghost score emoji
  const scoreEmoji =
    replyRate >= 90 ? "A+" :
    replyRate >= 80 ? "A" :
    replyRate >= 70 ? "B" :
    replyRate >= 60 ? "C" :
    replyRate >= 50 ? "D" : "F";

  // Top ghosted (people you neglect most)
  const ghosted = [...contacts]
    .filter((c) => c.totalGhosted > 0)
    .sort((a, b) => b.totalGhosted - a.totalGhosted)
    .slice(0, 3);

  // Best streaks
  const streaks = [...contacts]
    .filter((c) => c.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 3);

  // Slowest reply times
  const slowest = [...contacts]
    .filter((c) => c.avgReplyMinutes > 0)
    .sort((a, b) => b.avgReplyMinutes - a.avgReplyMinutes)
    .slice(0, 3);

  // Recent 7-day trend
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    return tracker.dailyStats[d] ?? { ghosted: 0, replied: 0, nudged: 0 };
  });
  const weekReplied = last7.reduce((s, d) => s + d.replied, 0);
  const weekGhosted = last7.reduce((s, d) => s + d.ghosted, 0);

  let report = `Ghost Report\n\n`;
  report += `Score: ${scoreEmoji} (${replyRate}% reply rate)\n`;
  report += `This week: ${weekReplied} replied, ${weekGhosted} ghosted\n\n`;

  if (ghosted.length > 0) {
    report += `Most ghosted:\n`;
    ghosted.forEach((c) => {
      report += `  ${c.name} — ${c.totalGhosted}x ghosted\n`;
    });
    report += `\n`;
  }

  if (slowest.length > 0) {
    report += `Slowest replies:\n`;
    slowest.forEach((c) => {
      const time = c.avgReplyMinutes < 60
        ? `${c.avgReplyMinutes}min`
        : `${Math.round(c.avgReplyMinutes / 60)}hr`;
      report += `  ${c.name} — avg ${time}\n`;
    });
    report += `\n`;
  }

  if (streaks.length > 0) {
    report += `Best streaks:\n`;
    streaks.forEach((c) => {
      report += `  ${c.name} — ${c.streak} day streak\n`;
    });
  }

  return report;
}

/**
 * Analyze message history to build initial tracker data.
 */
export async function bootstrapTracker(sdk: IMessageSDK, tracker: TrackerData) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await sdk.getMessages({ limit: 500, since });

  const chatMessages = new Map<string, typeof result.messages>();
  for (const msg of result.messages) {
    if (msg.isGroupChat) continue;
    const existing = chatMessages.get(msg.chatId) ?? [];
    existing.push(msg);
    chatMessages.set(msg.chatId, existing);
  }

  for (const [, messages] of chatMessages) {
    messages.sort((a, b) => a.date.getTime() - b.date.getTime());

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.isFromMe || !msg.text) continue;

      const contact = ensureContact(tracker, msg.sender, msg.senderName);
      contact.totalReceived++;
      contact.lastContact = msg.date.toISOString();

      // Check if we replied
      const nextMsg = messages[i + 1];
      if (nextMsg?.isFromMe) {
        contact.totalReplied++;
        const replyTime = (nextMsg.date.getTime() - msg.date.getTime()) / (1000 * 60);
        if (replyTime < 1440) {
          // Only count replies within 24 hours as "real" replies
          const total = contact.avgReplyMinutes * (contact.totalReplied - 1) + replyTime;
          contact.avgReplyMinutes = Math.round(total / contact.totalReplied);
        }
      }
    }
  }

  saveTracker(tracker);
}
