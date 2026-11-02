/**
 * Robust JSON extraction helper for LLM responses.
 * 
 * Rules per BUILD.md:
 * 1. Strips any `<think>...</think>` block.
 * 2. Ignores separate reasoning fields.
 * 3. Extracts the LAST top-level JSON object in the content.
 * 4. Handles markdown fences (```json ... ```).
 * 5. Throws if no valid JSON object can be extracted.
 */

export function stripThinkingBlocks(rawText: string): string {
  if (!rawText) return "";
  // Strip closed think blocks
  let text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // If an unclosed think block remains at the beginning, strip it
  text = text.replace(/<think>[\s\S]*$/gi, "");
  return text.trim();
}

/**
 * Extracts and parses the last top-level JSON object from a string.
 */
export function extractJson<T = unknown>(rawText: string): T {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Invalid input: text must be a non-empty string");
  }

  // Step 1: Strip thinking blocks
  const cleaned = stripThinkingBlocks(rawText);
  if (!cleaned) {
    throw new Error("No content remaining after stripping thinking blocks");
  }

  // Step 2: Check for markdown code fences (```json ... ``` or ``` ... ```)
  // Search from the end for the last markdown code fence
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  const matches = [...cleaned.matchAll(fenceRegex)];
  if (matches.length > 0) {
    // Check backwards from the last fence
    for (let i = matches.length - 1; i >= 0; i--) {
      const candidate = matches[i][1].trim();
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed as T;
        }
      } catch {
        // Continue searching
      }
    }
  }

  // Step 3: Find balanced top-level JSON objects from the text
  // We scan for top-level { ... } and take the last valid one
  const objectCandidates = findTopLevelObjects(cleaned);
  if (objectCandidates.length > 0) {
    // Last object wins
    for (let i = objectCandidates.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(objectCandidates[i]);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed as T;
        }
      } catch {
        // Try next
      }
    }
  }

  // Step 4: Try whole cleaned text in case it is already strict JSON
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as T;
    }
  } catch {
    // Fall through to error
  }

  throw new Error(`Failed to extract valid JSON object from model output: ${cleaned.slice(0, 100)}...`);
}

/**
 * Locates top-level balanced `{ ... }` substrings within text.
 */
function findTopLevelObjects(text: string): string[] {
  const candidates: string[] = [];
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        startIndex = i;
      }
      depth++;
    } else if (char === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && startIndex !== -1) {
          candidates.push(text.slice(startIndex, i + 1));
          startIndex = -1;
        }
      }
    }
  }

  return candidates;
}
