/**
 * Ghost Brain Dump
 * Catches self-texts that aren't commands and turns them into
 * categorized captures with optional reminders.
 *
 * Text yourself anything. Ghost catches it, tags it, reminds you later.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";

const DATA_DIR = join(import.meta.dir, "..", "data");
const DUMP_PATH = join(DATA_DIR, "dumps.json");

export type DumpCategory = "todo" | "idea" | "link" | "note" | "reminder";

export interface DumpEntry {
  id: string;
  text: string;
  category: DumpCategory;
  createdAt: string;
  done: boolean;
  reminderAt?: string; // ISO date if a reminder was detected
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadDumps(): DumpEntry[] {
  ensureDataDir();
  if (!existsSync(DUMP_PATH)) return [];
  try {
    return JSON.parse(readFileSync(DUMP_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveDumps(dumps: DumpEntry[]) {
  ensureDataDir();
  writeFileSync(DUMP_PATH, JSON.stringify(dumps, null, 2));
}

/**
 * Classify a self-text into a category using AI.
 */
async function classify(
  text: string
): Promise<{ category: DumpCategory; reminderTime?: string }> {
  try {
    const { text: result } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      system: `Classify this self-text into exactly one category. Respond with ONLY the category name on line 1, and optionally a reminder time on line 2.

Categories:
- todo: something to do ("buy milk", "call dentist", "finish report")
- idea: a thought or concept ("what if we...", "maybe I should...")
- link: a URL or reference to look at later
- note: general info to remember ("wifi password is...", "meeting at 3pm")
- reminder: explicitly asks to be reminded ("remind me to...", "don't forget to...")

If it's a reminder or todo with a time mentioned, put the time on line 2 like: REMIND: 30m (or 1h, 2h, tomorrow, etc)

Line 1: category
Line 2 (optional): REMIND: time`,
      prompt: text,
      temperature: 0,
      maxTokens: 50,
    });

    const lines = result.trim().split("\n");
    const category = (lines[0]?.trim().toLowerCase() || "note") as DumpCategory;
    const validCategories: DumpCategory[] = ["todo", "idea", "link", "note", "reminder"];
    const finalCategory = validCategories.includes(category) ? category : "note";

    let reminderTime: string | undefined;
    const reminderLine = lines.find((l) => l.startsWith("REMIND:"));
    if (reminderLine) {
      reminderTime = reminderLine.replace("REMIND:", "").trim();
    }

    return { category: finalCategory, reminderTime };
  } catch {
    // Fallback: simple pattern matching
    const lower = text.toLowerCase();
    if (/https?:\/\//.test(text)) return { category: "link" };
    if (/\b(remind|don't forget|remember to)\b/i.test(lower))
      return { category: "reminder" };
    if (/\b(todo|need to|gotta|should|have to|buy|call|email|send|finish|do)\b/i.test(lower))
      return { category: "todo" };
    if (/\b(what if|maybe|idea|could|might)\b/i.test(lower))
      return { category: "idea" };
    return { category: "note" };
  }
}

/**
 * Parse a reminder time string into milliseconds.
 */
function parseReminderMs(time: string): number | null {
  const match = time.match(/(\d+)\s*(m|min|h|hr|hour|d|day)/i);
  if (match) {
    const num = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("m")) return num * 60 * 1000;
    if (unit.startsWith("h")) return num * 60 * 60 * 1000;
    if (unit.startsWith("d")) return num * 24 * 60 * 60 * 1000;
  }
  if (/tomorrow/i.test(time)) return 12 * 60 * 60 * 1000;
  return null;
}

/**
 * Capture a self-text as a brain dump entry.
 * Returns confirmation message + optional reminder timeout.
 */
export async function captureDump(
  text: string
): Promise<{ confirmation: string; reminderMs?: number; entry: DumpEntry }> {
  const { category, reminderTime } = await classify(text);
  const dumps = loadDumps();

  const entry: DumpEntry = {
    id: crypto.randomUUID().slice(0, 8),
    text,
    category,
    createdAt: new Date().toISOString(),
    done: false,
  };

  let reminderMs: number | undefined;
  if (reminderTime) {
    reminderMs = parseReminderMs(reminderTime) ?? undefined;
    if (reminderMs) {
      entry.reminderAt = new Date(Date.now() + reminderMs).toISOString();
    }
  }

  dumps.push(entry);
  saveDumps(dumps);

  const emoji =
    category === "todo" ? "+" :
    category === "idea" ? ">" :
    category === "link" ? "#" :
    category === "reminder" ? "!" :
    "-";

  const reminderNote = reminderMs
    ? ` (will remind you)`
    : "";

  const confirmation = `${emoji} caught as ${category}${reminderNote}`;

  return { confirmation, reminderMs, entry };
}

/**
 * Get a summary of all brain dumps.
 */
export function getDumpSummary(): string {
  const dumps = loadDumps();
  if (dumps.length === 0) return "brain dump is empty. text yourself anything and i'll catch it.";

  const todos = dumps.filter((d) => d.category === "todo" && !d.done);
  const ideas = dumps.filter((d) => d.category === "idea");
  const notes = dumps.filter((d) => d.category === "note");
  const links = dumps.filter((d) => d.category === "link");
  const reminders = dumps.filter((d) => d.category === "reminder" && !d.done);

  let summary = "brain dump:\n\n";

  if (todos.length > 0) {
    summary += `todos (${todos.length}):\n`;
    todos.slice(0, 5).forEach((t) => {
      summary += `  - ${t.text}\n`;
    });
    summary += "\n";
  }

  if (ideas.length > 0) {
    summary += `ideas (${ideas.length}):\n`;
    ideas.slice(0, 5).forEach((t) => {
      summary += `  > ${t.text}\n`;
    });
    summary += "\n";
  }

  if (reminders.length > 0) {
    summary += `reminders (${reminders.length}):\n`;
    reminders.slice(0, 5).forEach((t) => {
      summary += `  ! ${t.text}\n`;
    });
    summary += "\n";
  }

  if (links.length > 0) {
    summary += `links (${links.length}):\n`;
    links.slice(0, 3).forEach((t) => {
      summary += `  # ${t.text}\n`;
    });
    summary += "\n";
  }

  if (notes.length > 0) {
    summary += `notes (${notes.length}):\n`;
    notes.slice(0, 3).forEach((t) => {
      summary += `  - ${t.text}\n`;
    });
  }

  return summary.trim();
}

/**
 * Mark a dump entry as done by partial text match.
 */
export function markDumpDone(query: string): DumpEntry | null {
  const dumps = loadDumps();
  const match = dumps.find(
    (d) => !d.done && d.text.toLowerCase().includes(query.toLowerCase())
  );
  if (match) {
    match.done = true;
    saveDumps(dumps);
  }
  return match ?? null;
}

/**
 * Clear all completed dumps.
 */
export function clearDoneDumps(): number {
  const dumps = loadDumps();
  const before = dumps.length;
  const remaining = dumps.filter((d) => !d.done);
  saveDumps(remaining);
  return before - remaining.length;
}
