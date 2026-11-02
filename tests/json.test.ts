import { describe, it, expect } from "vitest";
import { extractJson, stripThinkingBlocks } from "../src/lib/json";

describe("JSON Extractor (T5)", () => {
  it("extracts plain JSON", () => {
    const raw = '{"decision": "allow", "confidence": 0.95}';
    const result = extractJson<{ decision: string; confidence: number }>(raw);
    expect(result).toEqual({ decision: "allow", confidence: 0.95 });
  });

  it("extracts JSON with text outside <think> blocks", () => {
    const raw = `<think>
I should check if the action is safe.
The declared task is reading invoices.
{"discarded": true}
</think>
Here is my final verdict:
{"decision": "tighten", "confidence": 0.88}`;

    const result = extractJson<{ decision: string; confidence: number }>(raw);
    expect(result).toEqual({ decision: "tighten", confidence: 0.88 });
  });

  it("strips thinking blocks completely", () => {
    const raw = "<think>internal reasoning tokens</think>Actual output";
    expect(stripThinkingBlocks(raw)).toBe("Actual output");
  });

  it("extracts fenced markdown JSON", () => {
    const raw = `I evaluated the proposed agent action.
\`\`\`json
{
  "decision": "warn",
  "intentMatch": "partial",
  "confidence": 0.72
}
\`\`\`
Hope this helps!`;

    const result = extractJson<{ decision: string; intentMatch: string; confidence: number }>(raw);
    expect(result).toEqual({
      decision: "warn",
      intentMatch: "partial",
      confidence: 0.72,
    });
  });

  it("picks the last top-level object when multiple objects are present (last wins)", () => {
    const raw = `
First draft: {"decision": "allow", "draft": 1}
Revised thought: {"decision": "tighten", "reasons": ["off_task"]}
Final verdict: {"decision": "freeze", "final": true}`;

    const result = extractJson<{ decision: string; final: boolean }>(raw);
    expect(result).toEqual({ decision: "freeze", final: true });
  });

  it("handles nested objects and escaped quotes correctly", () => {
    const raw = `Prefix
{"outer": {"inner": "hello \\"world\\"", "num": 42}}
Suffix`;
    const result = extractJson<{ outer: { inner: string; num: number } }>(raw);
    expect(result).toEqual({
      outer: { inner: 'hello "world"', num: 42 },
    });
  });

  it("throws when given garbage text with no JSON object", () => {
    const raw = "This is pure conversational output with no valid JSON anywhere!";
    expect(() => extractJson(raw)).toThrow();
  });

  it("throws when given empty string", () => {
    expect(() => extractJson("")).toThrow();
  });
});
