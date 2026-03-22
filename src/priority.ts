/**
 * Ghost Priority Detection
 * Determines how urgently a message needs a reply.
 * Urgent messages get faster nudges.
 */

export type Priority = "urgent" | "normal" | "low";

interface PriorityResult {
  priority: Priority;
  reason: string;
  thresholdMultiplier: number; // 0.25 = nudge at 25% of normal threshold
}

// Patterns that indicate urgency
const URGENT_PATTERNS = [
  { pattern: /\bare you (?:ok(?:ay)?|alright|safe)\b/i, reason: "safety check" },
  { pattern: /\b(?:emergency|urgent|asap|help|sos)\b/i, reason: "emergency" },
  { pattern: /\b(?:where are you|worried about you)\b/i, reason: "someone's worried" },
  { pattern: /\b(?:call me|pick up|answer)\b/i, reason: "wants to talk" },
  { pattern: /\b(?:deadline|due today|due tomorrow|last chance)\b/i, reason: "deadline" },
  { pattern: /\?{2,}/i, reason: "double question marks" },
];

// Patterns that indicate a question (needs answer)
const QUESTION_PATTERNS = [
  { pattern: /\?$/, reason: "direct question" },
  { pattern: /\b(?:what|when|where|who|how|why|which|can you|could you|would you|do you|are you|will you)\b/i, reason: "question" },
  { pattern: /\b(?:thoughts|opinion|think about|prefer|want to|free to|down to|available)\b/i, reason: "asking for input" },
  { pattern: /\b(?:yes or no|confirm|let me know|lmk)\b/i, reason: "needs confirmation" },
];

// Patterns that are low priority (no reply urgently needed)
const LOW_PATTERNS = [
  { pattern: /^(?:lol|lmao|haha|😂|🤣|😭|💀)+$/i, reason: "reaction only" },
  { pattern: /^(?:ok|okay|k|bet|word|facts|fr|real|true)$/i, reason: "acknowledgment" },
  { pattern: /^(?:👍|❤️|🔥|💯|🙌|🫡|😎)+$/i, reason: "emoji only" },
  { pattern: /^(?:nice|cool|dope|sick|sweet|lit)$/i, reason: "one-word reaction" },
];

/**
 * Analyze a message and determine reply priority.
 */
export function detectPriority(text: string): PriorityResult {
  // Check urgent first
  for (const { pattern, reason } of URGENT_PATTERNS) {
    if (pattern.test(text)) {
      return { priority: "urgent", reason, thresholdMultiplier: 0.25 };
    }
  }

  // Check low priority
  for (const { pattern, reason } of LOW_PATTERNS) {
    if (pattern.test(text)) {
      return { priority: "low", reason, thresholdMultiplier: 3 };
    }
  }

  // Check questions
  for (const { pattern, reason } of QUESTION_PATTERNS) {
    if (pattern.test(text)) {
      return { priority: "normal", reason, thresholdMultiplier: 0.75 };
    }
  }

  // Default
  return { priority: "normal", reason: "general message", thresholdMultiplier: 1 };
}
