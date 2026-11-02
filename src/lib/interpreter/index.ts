import {
  Briefing,
  BriefingSchema,
  Rule,
  PermissionState,
  Restriction,
} from "../../contracts";
import { prisma } from "../db";
import { chatJson } from "../tokenfactory";
import { appendEvent } from "../audit/chain";
import { validateRestriction, applyRestriction } from "../policy/ratchet";

export const INTERPRETER_BRIEFING_PROMPT = `You are the Taut Incident Interpreter.
Your job is to provide concise, plain-language executive briefings for human operators when an agent drifts or is restricted.

CRITICAL INSTRUCTIONS:
1. WORD COUNT LIMIT: The total response MUST BE UNDER 120 WORDS.
2. CITATIONS: In the "cites" array, include ONLY the exact event IDs provided in the event list.
3. CLEAR SECTIONS:
   - whatHappened: 1-2 sentences summarizing the offending action and tool.
   - whyFlagged: 1 sentence explaining why this contradicted the declared task.
   - whatWasRestricted: What permissions were revoked, tools disabled, or if the run was frozen.
   - humanOptions: 1 to 3 concrete options available to the human approver (e.g. "Approve held action", "Restore /hr/ scope", "Deny and terminate").

OUTPUT FORMAT (JSON ONLY):
{
  "whatHappened": string,
  "whyFlagged": string,
  "whatWasRestricted": string,
  "humanOptions": string[],
  "cites": string[]
}`;

export const RULE_DRAFTER_PROMPT = `You are the Taut Rule Drafting Assistant.
Translate a human plain-language security rule into exactly ONE valid tighten-only restriction.

ALLOWED RESTRICTIONS (CLOSED UNION):
1. {"kind": "revoke_scope", "tool": "read_file"|"write_file"|"list_files", "scope": "/prefix/"}
2. {"kind": "disable_tool", "tool": "list_files"|"read_file"|"write_file"|"query_invoices"|"send_email"}
3. {"kind": "require_approval", "tool": "list_files"|"read_file"|"write_file"|"query_invoices"|"send_email"}
4. {"kind": "freeze_run"}

DO NOT create widening rules, grants, or unfreeze actions. Output ONLY the single JSON restriction object.`;

function countWords(briefing: Briefing): number {
  const allText = [
    briefing.whatHappened,
    briefing.whyFlagged,
    briefing.whatWasRestricted,
    ...briefing.humanOptions,
  ].join(" ");
  return allText.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Generates an executive briefing for an incident (freeze or hold).
 * Cached per incidentKey.
 */
export async function briefIncident(runId: string): Promise<Briefing> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  // Load all events for context
  const events = await prisma.event.findMany({
    where: { runId },
    orderBy: { seq: "asc" },
  });

  const incidentEvent = [...events].reverse().find(
    (e) =>
      e.type === "action_held" ||
      e.type === "run_frozen" ||
      e.type === "action_blocked" ||
      e.type === "restriction_applied"
  );

  const incidentSeq = incidentEvent ? incidentEvent.seq : events.length;
  const incidentKey = `${runId}_${incidentSeq}`;

  // Check cache in Briefing table
  const cached = await prisma.briefing.findFirst({
    where: { incidentKey },
  });

  if (cached) {
    return cached.content as unknown as Briefing;
  }

  // Build prompt context with real event IDs
  const eventSummaries = events.slice(-15).map((e) => {
    return `Event ID: ${e.id} | Seq: ${e.seq} | Type: ${e.type} | Payload: ${JSON.stringify(e.payload)}`;
  });

  const userPrompt = `DECLARED TASK:
${run.declaredTask}

RUN STATUS: ${run.status}

RECORDED AUDIT EVENTS (use these Event IDs for citations):
${eventSummaries.join("\n")}

Draft an incident briefing in under 120 words citing real Event IDs.`;

  // First call to Ultra
  let result = await chatJson<Briefing>({
    tier: "ultra",
    system: INTERPRETER_BRIEFING_PROMPT,
    user: userPrompt,
    schema: BriefingSchema,
    runId,
  });

  let briefing = result.data;

  // Retry once if longer than 120 words per BUILD.md
  if (countWords(briefing) > 120) {
    const retryPrompt = `${userPrompt}\n\nWARNING: Your previous output was ${countWords(briefing)} words. You MUST shorten it to be STRICTLY LESS THAN 120 words total.`;
    const retryResult = await chatJson<Briefing>({
      tier: "ultra",
      system: INTERPRETER_BRIEFING_PROMPT,
      user: retryPrompt,
      schema: BriefingSchema,
      runId,
    });
    briefing = retryResult.data;
  }

  // Filter cites to ensure they only contain real event IDs
  const validEventIds = new Set(events.map((e) => e.id));
  briefing.cites = briefing.cites.filter((id) => validEventIds.has(id));
  if (briefing.cites.length === 0 && incidentEvent) {
    briefing.cites = [incidentEvent.id];
  }

  // Cache in DB
  await prisma.briefing.create({
    data: {
      runId,
      incidentKey,
      content: briefing as any,
    },
  });

  await appendEvent(runId, "briefing_generated", {
    incidentKey,
    wordCount: countWords(briefing),
    citesCount: briefing.cites.length,
  });

  return briefing;
}

/**
 * Drafts a security rule from human plain text using Nemotron Super (P2).
 */
export async function draftRule(runId: string, text: string): Promise<Rule> {
  const userPrompt = `Translate this natural language security policy into a restriction:
"${text}"`;

  const result = await chatJson<Record<string, unknown>>({
    tier: "super",
    system: RULE_DRAFTER_PROMPT,
    user: userPrompt,
    schema: BriefingSchema.shape.humanOptions as any, // fallback object parse
    runId,
  }).catch(async () => {
    // Direct call with loose object schema
    const { z } = await import("zod");
    return chatJson<Record<string, unknown>>({
      tier: "super",
      system: RULE_DRAFTER_PROMPT,
      user: userPrompt,
      schema: z.record(z.unknown()),
      runId,
    });
  });

  const validated = validateRestriction(result.data);
  if (!validated) {
    throw new Error("Could not turn that into a safe rule.");
  }

  const created = await prisma.rule.create({
    data: {
      runId,
      sourceText: text,
      restriction: validated as any,
      status: "draft",
    },
  });

  await appendEvent(runId, "rule_drafted", {
    ruleId: created.id,
    sourceText: text,
    restriction: validated,
  });

  return {
    id: created.id,
    runId: created.runId,
    sourceText: created.sourceText,
    restriction: validated,
    status: "draft",
    activatedBy: null,
  };
}

/**
 * Activates a drafted rule through the ratchet (P2).
 */
export async function activateRule(
  ruleId: string,
  approverId: string
): Promise<{ rule: Rule; permissionState: PermissionState }> {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: { run: true },
  });

  if (!rule) {
    throw new Error(`Rule ${ruleId} not found`);
  }

  const restriction = rule.restriction as unknown as Restriction;
  let state = rule.run.permissionState as unknown as PermissionState;

  // Apply through ratchet
  state = applyRestriction(state, restriction, "interpreter_rule");

  await prisma.run.update({
    where: { id: rule.runId },
    data: { permissionState: state as any },
  });

  const updatedRule = await prisma.rule.update({
    where: { id: ruleId },
    data: {
      status: "active",
      activatedBy: approverId,
    },
  });

  await appendEvent(rule.runId, "rule_activated", {
    ruleId: updatedRule.id,
    activatedBy: approverId,
    newVersion: state.version,
  });

  return {
    rule: {
      id: updatedRule.id,
      runId: updatedRule.runId,
      sourceText: updatedRule.sourceText,
      restriction,
      status: "active",
      activatedBy: approverId,
    },
    permissionState: state,
  };
}
