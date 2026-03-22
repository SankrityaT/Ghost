/**
 * Ghost Drafter
 * AI-powered reply drafting that sounds like YOU, not a robot.
 * Uses conversation history + your past messages to match your voice.
 */

import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import type { IMessageSDK } from "@photon-ai/imessage-kit";
import type { GhostedMessage } from "./scanner.js";
import type { Priority } from "./priority.js";

const model = groq("llama-3.3-70b-versatile");

export interface DraftedReply {
  casual: string;
  warm: string;
  brief: string;
}

/**
 * Get YOUR past messages to learn your texting style.
 */
async function getMyVoice(sdk: IMessageSDK, chatId: string): Promise<string> {
  try {
    const result = await sdk.getMessages({
      chatId,
      limit: 30,
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // last 30 days
    });

    const myMessages = result.messages
      .filter((m) => m.isFromMe && m.text && m.text.length > 5)
      .map((m) => m.text!)
      .slice(-15);

    if (myMessages.length === 0) return "";

    return `The user's texting style (real examples from their past messages):\n${myMessages.map((m) => `- "${m}"`).join("\n")}`;
  } catch {
    return "";
  }
}

/**
 * Get recent conversation context for a chat.
 */
async function getConversationContext(
  sdk: IMessageSDK,
  chatId: string
): Promise<string> {
  try {
    const result = await sdk.getMessages({
      chatId,
      limit: 15,
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    });

    return result.messages
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((m) => {
        const who = m.isFromMe ? "You" : m.senderName || m.sender;
        return `${who}: ${m.text || "(attachment)"}`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

/**
 * Draft 3 reply options that sound like the user.
 */
export async function draftReplies(
  sdk: IMessageSDK,
  ghosted: GhostedMessage,
  priority: Priority
): Promise<DraftedReply> {
  const [context, voice] = await Promise.all([
    getConversationContext(sdk, ghosted.chatId),
    getMyVoice(sdk, ghosted.chatId),
  ]);

  const senderName = ghosted.senderName || ghosted.sender;
  const hoursAgo = Math.round(ghosted.minutesAgo / 60);

  const timeDesc =
    hoursAgo < 1
      ? `${ghosted.minutesAgo} minutes ago`
      : hoursAgo === 1
        ? "about an hour ago"
        : `${hoursAgo} hours ago`;

  const urgencyNote =
    priority === "urgent"
      ? "\nIMPORTANT: This message seems urgent. Make the replies responsive and acknowledging."
      : priority === "low"
        ? "\nThis is a casual/low-priority message. Keep replies super chill and short."
        : "";

  const { text } = await generateText({
    model,
    system: `You are a reply ghostwriter. The user forgot to reply to a text from ${senderName} sent ${timeDesc}. Draft 3 replies that sound EXACTLY like the user — not like AI.
${urgencyNote}

${voice || "No style samples available — default to casual, natural texting."}

CRITICAL RULES:
- These are iMessage replies. SHORT and NATURAL.
- MATCH THE USER'S ACTUAL TEXTING STYLE from the examples above. If they use lowercase, use lowercase. If they use slang, use slang. If they're formal, be formal.
- DO NOT mention you're an AI or that you're drafting.
- DO NOT apologize for the late reply unless it's been 6+ hours.
- If the message is a question, ANSWER it (make reasonable assumptions).
- Each reply: 1-2 sentences MAX.
- No emojis unless the user's style samples show emoji use.

FORMAT (exactly 3 lines):
CASUAL: [relaxed reply in their voice]
WARM: [friendly, engaged reply in their voice]
BRIEF: [shortest possible reply]`,
    prompt: `${context ? `Recent conversation:\n${context}\n\n` : ""}Their message: "${ghosted.text}"

Draft 3 replies matching the user's voice:`,
    temperature: 0.8,
    maxTokens: 300,
  });

  // Parse the response
  const lines = text.split("\n").filter((l) => l.trim());
  const casual =
    lines.find((l) => l.startsWith("CASUAL:"))?.replace("CASUAL:", "").trim() ??
    "Hey! Sorry I missed this";
  const warm =
    lines.find((l) => l.startsWith("WARM:"))?.replace("WARM:", "").trim() ??
    "Hey! Just saw this";
  const brief =
    lines.find((l) => l.startsWith("BRIEF:"))?.replace("BRIEF:", "").trim() ??
    "Got it!";

  return { casual, warm, brief };
}

/**
 * Build the nudge message that Ghost sends you.
 */
export function buildNudge(
  ghosted: GhostedMessage,
  drafts: DraftedReply,
  priority: Priority
): string {
  const name = ghosted.senderName || ghosted.sender;
  const hoursAgo = Math.round(ghosted.minutesAgo / 60);

  const timeStr =
    hoursAgo < 1
      ? `${ghosted.minutesAgo}m ago`
      : hoursAgo === 1
        ? "1 hr ago"
        : `${hoursAgo} hrs ago`;

  const urgencyTag =
    priority === "urgent" ? " !! URGENT" : priority === "low" ? " (low priority)" : "";

  // Truncate their message if too long
  const theirMsg =
    ghosted.text.length > 80 ? ghosted.text.slice(0, 77) + "..." : ghosted.text;

  return [
    `You're ghosting ${name}${urgencyTag} (${timeStr})`,
    ``,
    `"${theirMsg}"`,
    ``,
    `Quick replies:`,
    `1. ${drafts.casual}`,
    `2. ${drafts.warm}`,
    `3. ${drafts.brief}`,
    ``,
    `Reply 1, 2, or 3 to send — or type your own.`,
  ].join("\n");
}
