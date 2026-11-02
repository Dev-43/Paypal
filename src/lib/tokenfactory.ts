import OpenAI from "openai";
import { z } from "zod";
import { Tier } from "../contracts";
import { extractJson } from "./json";
import { prisma } from "./db";

export class ModelOutputError extends Error {
  constructor(message: string, public rawOutput?: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

interface TierConfig {
  modelEnv: string;
  defaultModel: string;
  maxTokens: number;
  timeoutMs: number;
  priceInEnv: string;
  defaultPriceIn: number;
  priceOutEnv: string;
  defaultPriceOut: number;
}

const TIER_CONFIGS: Record<Tier | "agent", TierConfig> = {
  nano: {
    modelEnv: "TF_MODEL_NANO",
    defaultModel: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
    maxTokens: 2048,
    timeoutMs: 25000,
    priceInEnv: "PRICE_NANO_IN",
    defaultPriceIn: 0.06,
    priceOutEnv: "PRICE_NANO_OUT",
    defaultPriceOut: 0.24,
  },
  super: {
    modelEnv: "TF_MODEL_SUPER",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    maxTokens: 2500,
    timeoutMs: 35000,
    priceInEnv: "PRICE_SUPER_IN",
    defaultPriceIn: 0.30,
    priceOutEnv: "PRICE_SUPER_OUT",
    defaultPriceOut: 0.90,
  },
  ultra: {
    modelEnv: "TF_MODEL_ULTRA",
    defaultModel: "nvidia/Nemotron-3-Ultra-550b-a55b",
    maxTokens: 3500,
    timeoutMs: 60000,
    priceInEnv: "PRICE_ULTRA_IN",
    defaultPriceIn: 1.00,
    priceOutEnv: "PRICE_ULTRA_OUT",
    defaultPriceOut: 3.00,
  },
  agent: {
    modelEnv: "TF_MODEL_AGENT",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    maxTokens: 2048,
    timeoutMs: 35000,
    priceInEnv: "PRICE_SUPER_IN",
    defaultPriceIn: 0.30,
    priceOutEnv: "PRICE_SUPER_OUT",
    defaultPriceOut: 0.90,
  },
};

export function getTierModel(tier: Tier | "agent"): string {
  const config = TIER_CONFIGS[tier];
  return process.env[config.modelEnv] || config.defaultModel;
}

export function computeCostUsd(tier: Tier | "agent", tokensIn: number, tokensOut: number): number {
  const config = TIER_CONFIGS[tier];
  const priceIn = parseFloat(process.env[config.priceInEnv] || `${config.defaultPriceIn}`);
  const priceOut = parseFloat(process.env[config.priceOutEnv] || `${config.defaultPriceOut}`);
  const cost = (tokensIn * priceIn + tokensOut * priceOut) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.NEBIUS_API_KEY || "dummy-key-for-offline-build";
  const baseURL = process.env.TF_BASE_URL || "https://api.tokenfactory.nebius.com/v1/";
  return new OpenAI({
    apiKey,
    baseURL,
  });
}

export interface ChatJsonOptions<T> {
  tier: Tier | "agent";
  system: string;
  user: string;
  schema: z.ZodType<T>;
  runId?: string;
  temperature?: number;
}

export interface ChatJsonResult<T> {
  data: T;
  usage: {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    latencyMs: number;
    model: string;
  };
}

/**
 * Universal JSON chat invocation against Nebius Token Factory.
 * Features:
 * - Tier-based timeout, token caps, and pricing
 * - Automatic retry on 429/5xx/network errors
 * - Thinking tag stripping and last-object JSON parsing
 * - One repair call on validation/parse error, then ModelOutputError
 * - Automatic SpendLedger persistence
 */
export async function chatJson<T>(opts: ChatJsonOptions<T>): Promise<ChatJsonResult<T>> {
  const { tier, system, user, schema, runId, temperature = 0 } = opts;
  const config = TIER_CONFIGS[tier];
  const model = getTierModel(tier);
  const client = getOpenAIClient();

  const callModelOnce = async (
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    attempt = 1
  ): Promise<{ content: string; tokensIn: number; tokensOut: number; latencyMs: number }> => {
    const startTime = Date.now();
    try {
      const response = await client.chat.completions.create(
        {
          model,
          messages,
          max_tokens: config.maxTokens,
          temperature,
          response_format: { type: "json_object" },
        },
        {
          timeout: config.timeoutMs,
        }
      );

      const latencyMs = Date.now() - startTime;
      const message = response.choices[0]?.message;
      let content = message?.content || "";
      if (!content.trim() && (message as unknown as { reasoning?: string })?.reasoning) {
        content = (message as unknown as { reasoning: string }).reasoning;
      }
      const tokensIn = response.usage?.prompt_tokens ?? 0;
      const tokensOut = response.usage?.completion_tokens ?? 0;

      return { content, tokensIn, tokensOut, latencyMs };
    } catch (err: unknown) {
      const error = err as { status?: number; code?: string; message?: string };
      const isRetryable =
        error.status === 429 ||
        (error.status && error.status >= 500) ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNRESET";

      if (attempt === 1 && isRetryable) {
        // Wait 1000ms then retry once
        await new Promise((res) => setTimeout(res, 1000));
        return callModelOnce(messages, 2);
      }
      throw err;
    }
  };

  // First call
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: `${system}\nCRITICAL: Reply with VALID JSON ONLY.` },
    { role: "user", content: user },
  ];

  let initialCall = await callModelOnce(messages);
  let totalTokensIn = initialCall.tokensIn;
  let totalTokensOut = initialCall.tokensOut;
  let totalLatencyMs = initialCall.latencyMs;

  // Try extracting and validating JSON
  let extracted: unknown;
  let parseSuccess = false;
  try {
    extracted = extractJson(initialCall.content);
    const validated = schema.safeParse(extracted);
    if (validated.success) {
      parseSuccess = true;
      extracted = validated.data;
    }
  } catch {
    parseSuccess = false;
  }

  // ONE repair call if parsing or validation failed
  if (!parseSuccess) {
    const repairPrompt = `The previous response failed schema validation or was malformed JSON.\nRaw output was:\n${initialCall.content}\n\nPlease output ONLY a single valid JSON object strictly conforming to the required schema. No explanations, no markdown fences.`;

    const repairMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      ...messages,
      { role: "assistant", content: initialCall.content },
      { role: "user", content: repairPrompt },
    ];

    try {
      const repairCall = await callModelOnce(repairMessages);
      totalTokensIn += repairCall.tokensIn;
      totalTokensOut += repairCall.tokensOut;
      totalLatencyMs += repairCall.latencyMs;

      const repairedExtracted = extractJson(repairCall.content);
      const validated = schema.safeParse(repairedExtracted);
      if (validated.success) {
        extracted = validated.data;
        parseSuccess = true;
      } else {
        throw new ModelOutputError(
          `Repair call output failed schema validation: ${JSON.stringify(validated.error.issues)}`,
          repairCall.content
        );
      }
    } catch (repairErr: unknown) {
      if (repairErr instanceof ModelOutputError) throw repairErr;
      throw new ModelOutputError(
        `Failed to parse model output after repair retry: ${repairErr instanceof Error ? repairErr.message : String(repairErr)}`,
        initialCall.content
      );
    }
  }

  const costUsd = computeCostUsd(tier, totalTokensIn, totalTokensOut);

  // Write SpendLedger row
  try {
    await prisma.spendLedger.create({
      data: {
        runId: runId || null,
        tier,
        model,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        costUsd,
        latencyMs: totalLatencyMs,
      },
    });
  } catch (dbErr) {
    console.warn("Could not record SpendLedger row:", dbErr);
  }

  return {
    data: extracted as T,
    usage: {
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      costUsd,
      latencyMs: totalLatencyMs,
      model,
    },
  };
}
