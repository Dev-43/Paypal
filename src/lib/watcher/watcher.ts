import {
  WatcherInput,
  WatcherResult,
  WatcherCall,
  Verdict,
  WatcherModelOutputSchema,
  WatcherModelOutput,
  Tier,
  WatcherUnavailableError,
} from "../../contracts";
import { chatJson, ModelOutputError } from "../tokenfactory";
import { WATCHER_SYSTEM_PROMPT, buildWatcherUserPrompt } from "./prompt";

/**
 * Executes action judgment across the tiered Nemotron cascade (Nano -> Super -> Ultra).
 * Routing is entirely deterministic in code per BUILD.md section 9.
 */
export async function judgeAction(input: WatcherInput): Promise<WatcherResult> {
  const calls: WatcherCall[] = [];
  const escalatedFrom: Tier[] = [];
  const userPrompt = buildWatcherUserPrompt(input);

  const callTier = async (tier: Tier): Promise<{ output: WatcherModelOutput; call: WatcherCall }> => {
    try {
      const response = await chatJson<WatcherModelOutput>({
        tier,
        system: WATCHER_SYSTEM_PROMPT,
        user: userPrompt,
        schema: WatcherModelOutputSchema,
        runId: input.action.runId,
      });

      const call: WatcherCall = {
        tier,
        model: response.usage.model,
        decision: response.data.decision,
        confidence: response.data.confidence,
        tokensIn: response.usage.tokensIn,
        tokensOut: response.usage.tokensOut,
        costUsd: response.usage.costUsd,
        latencyMs: response.usage.latencyMs,
      };

      return { output: response.data, call };
    } catch (err: unknown) {
      if (err instanceof ModelOutputError || (err as { status?: number }).status) {
        throw new WatcherUnavailableError(
          `Watcher tier ${tier} failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      throw err;
    }
  };

  // Step 1: Every action goes to Nano
  const nanoResult = await callTier("nano");
  calls.push(nanoResult.call);

  let currentTier: Tier = "nano";
  let currentOutput = nanoResult.output;
  let currentCall = nanoResult.call;

  // Step 2: Escalate to Super if:
  // - Nano decision != allow
  // - OR Nano confidence < 0.8
  // - OR the action touches a sensitive path
  // - OR the action is send_email
  const needsSuper =
    currentOutput.decision !== "allow" ||
    currentOutput.confidence < 0.8 ||
    input.sensitivity === "sensitive" ||
    input.action.tool === "send_email";

  if (needsSuper) {
    escalatedFrom.push("nano");
    currentTier = "super";
    const superResult = await callTier("super");
    calls.push(superResult.call);
    currentOutput = superResult.output;
    currentCall = superResult.call;

    // Step 3: Escalate to Ultra if:
    // - Super decision is tighten or freeze (confirmation before ratchet moves)
    const needsUltra =
      currentOutput.decision === "tighten" || currentOutput.decision === "freeze";

    if (needsUltra) {
      escalatedFrom.push("super");
      currentTier = "ultra";
      const ultraResult = await callTier("ultra");
      calls.push(ultraResult.call);
      currentOutput = ultraResult.output;
      currentCall = ultraResult.call;
    }
  }

  // Aggregate total tokens, cost, and latency across all calls made in this evaluation
  const totalTokensIn = calls.reduce((sum, c) => sum + c.tokensIn, 0);
  const totalTokensOut = calls.reduce((sum, c) => sum + c.tokensOut, 0);
  const totalCostUsd = calls.reduce((sum, c) => sum + c.costUsd, 0);
  const totalLatencyMs = calls.reduce((sum, c) => sum + c.latencyMs, 0);

  const finalVerdict: Verdict = {
    decision: currentOutput.decision,
    intentMatch: currentOutput.intentMatch,
    confidence: currentOutput.confidence,
    reasons: currentOutput.reasons,
    evidence: currentOutput.evidence,
    restrictions: currentOutput.restrictions,
    tier: currentTier,
    escalatedFrom,
    model: currentCall.model,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    costUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    latencyMs: totalLatencyMs,
  };

  return {
    verdict: finalVerdict,
    calls,
  };
}
