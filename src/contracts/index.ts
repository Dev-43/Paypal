import { z } from "zod";

// ==========================================
// 6.1 Enums and Primitives
// ==========================================

export const ToolNameSchema = z.enum([
  "list_files",
  "read_file",
  "write_file",
  "query_invoices",
  "send_email",
]);
export type ToolName = z.infer<typeof ToolNameSchema>;

export const TierSchema = z.enum(["nano", "super", "ultra"]);
export type Tier = z.infer<typeof TierSchema>;

export const SensitivitySchema = z.enum(["public", "internal", "sensitive"]);
export type Sensitivity = z.infer<typeof SensitivitySchema>;

export const ModeSchema = z.enum(["baseline", "protected"]);
export type Mode = z.infer<typeof ModeSchema>;

export const RunStatusSchema = z.enum([
  "created",
  "running",
  "paused_held",
  "frozen",
  "completed",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const OutcomeSchema = z.enum(["executed", "held", "blocked", "frozen"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const DecisionSchema = z.enum(["allow", "warn", "tighten", "freeze"]);
export type Decision = z.infer<typeof DecisionSchema>;

export const IntentMatchSchema = z.enum(["matches", "partial", "off_task"]);
export type IntentMatch = z.infer<typeof IntentMatchSchema>;

// ==========================================
// 6.2 Grant
// ==========================================

export const GrantSchema = z.object({
  tool: ToolNameSchema,
  scope: z.string(),
});
export type Grant = z.infer<typeof GrantSchema>;

// ==========================================
// 6.3 Restriction (Closed Union)
// ==========================================

export const RevokeScopeRestrictionSchema = z.object({
  kind: z.literal("revoke_scope"),
  tool: ToolNameSchema,
  scope: z.string(),
});

export const DisableToolRestrictionSchema = z.object({
  kind: z.literal("disable_tool"),
  tool: ToolNameSchema,
});

export const RequireApprovalRestrictionSchema = z.object({
  kind: z.literal("require_approval"),
  tool: ToolNameSchema,
});

export const FreezeRunRestrictionSchema = z.object({
  kind: z.literal("freeze_run"),
});

export const RestrictionSchema = z.discriminatedUnion("kind", [
  RevokeScopeRestrictionSchema,
  DisableToolRestrictionSchema,
  RequireApprovalRestrictionSchema,
  FreezeRunRestrictionSchema,
]);
export type Restriction = z.infer<typeof RestrictionSchema>;

// ==========================================
// 6.4 PermissionState
// ==========================================

export const RestrictionLogEntrySchema = z.object({
  at: z.string().datetime(),
  by: z.enum(["watcher", "interpreter_rule", "hard_limit", "human"]),
  restriction: RestrictionSchema,
});
export type RestrictionLogEntry = z.infer<typeof RestrictionLogEntrySchema>;

export const PermissionStateSchema = z.object({
  version: z.number().int().min(1),
  grants: z.array(GrantSchema),
  disabledTools: z.array(ToolNameSchema),
  approvalRequiredTools: z.array(ToolNameSchema),
  frozen: z.boolean(),
  sensitiveRead: z.boolean(),
  restrictionLog: z.array(RestrictionLogEntrySchema),
});
export type PermissionState = z.infer<typeof PermissionStateSchema>;

// ==========================================
// 6.5 AgentAction
// ==========================================

export const AgentActionSchema = z.object({
  runId: z.string(),
  stepIndex: z.number().int().nonnegative(),
  tool: ToolNameSchema,
  args: z.record(z.unknown()),
  rationale: z.string(), // untrusted text
});
export type AgentAction = z.infer<typeof AgentActionSchema>;

// Target agent step response schema (from Nemotron)
export const AgentModelStepSchema = z.object({
  thought: z.string(),
  tool: z.union([ToolNameSchema, z.literal("finish")]),
  args: z.record(z.unknown()),
  rationale: z.string(),
});
export type AgentModelStep = z.infer<typeof AgentModelStepSchema>;

// ==========================================
// 6.6 Verdict (Watcher output after validation)
// ==========================================

export const VerdictSchema = z.object({
  decision: DecisionSchema,
  intentMatch: IntentMatchSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().max(160)).max(3),
  evidence: z.string().max(200),
  restrictions: z.array(RestrictionSchema).max(3),
  tier: TierSchema,
  escalatedFrom: z.array(TierSchema),
  model: z.string(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  costUsd: z.number(),
  latencyMs: z.number().int(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

// Model raw output schema for Watcher (before judgeAction populates metadata)
export const WatcherModelOutputSchema = z.object({
  decision: DecisionSchema,
  intentMatch: IntentMatchSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().max(160)).max(3),
  evidence: z.string().max(200),
  restrictions: z.array(RestrictionSchema).max(3),
});
export type WatcherModelOutput = z.infer<typeof WatcherModelOutputSchema>;

// ==========================================
// 6.7 GatewayCallInput / GatewayCallResult
// ==========================================

export const GatewayCallInputSchema = z.object({
  runId: z.string(),
  mode: ModeSchema,
  action: AgentActionSchema,
});
export type GatewayCallInput = z.infer<typeof GatewayCallInputSchema>;

export const GatewayCallResultSchema = z.object({
  outcome: OutcomeSchema,
  verdict: VerdictSchema.nullable(),
  toolResult: z.unknown().nullable(),
  message: z.string(),
  permissionVersion: z.number().int(),
  eventIds: z.array(z.string()),
  timings: z.object({
    hardLimitMs: z.number().int(),
    watcherMs: z.number().int(),
    totalMs: z.number().int(),
  }),
});
export type GatewayCallResult = z.infer<typeof GatewayCallResultSchema>;

// ==========================================
// 6.8 Event (Append-only, hash-chained)
// ==========================================

export const EventTypeSchema = z.enum([
  "run_started",
  "agent_step",
  "action_proposed",
  "hard_limit_checked",
  "watcher_called",
  "verdict_issued",
  "restriction_applied",
  "action_executed",
  "action_held",
  "action_blocked",
  "run_frozen",
  "human_action",
  "rule_drafted",
  "rule_activated",
  "briefing_generated",
  "watcher_unavailable",
  "run_completed",
  "error",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  seq: z.number().int().nonnegative(),
  type: EventTypeSchema,
  at: z.string().datetime(),
  payload: z.record(z.unknown()),
  prevHash: z.string(),
  hash: z.string(),
});
export type Event = z.infer<typeof EventSchema>;

// ==========================================
// 6.9 Run
// ==========================================

export const ScenarioIdSchema = z.enum(["S1", "S2", "S3"]);
export type ScenarioId = z.infer<typeof ScenarioIdSchema>;

export const RunSchema = z.object({
  id: z.string(),
  scenarioId: ScenarioIdSchema,
  mode: ModeSchema,
  declaredTask: z.string(),
  status: RunStatusSchema,
  stepCount: z.number().int().nonnegative(),
  heldAction: AgentActionSchema.nullable(),
  createdAt: z.string().datetime(),
});
export type Run = z.infer<typeof RunSchema>;

// ==========================================
// 6.10 Briefing (Interpreter Output)
// ==========================================

export const BriefingSchema = z.object({
  whatHappened: z.string(),
  whyFlagged: z.string(),
  whatWasRestricted: z.string(),
  humanOptions: z.array(z.string()).max(3),
  cites: z.array(z.string()), // real event ids
});
export type Briefing = z.infer<typeof BriefingSchema>;

// ==========================================
// 6.11 Rule (Interpreter Drafted)
// ==========================================

export const RuleStatusSchema = z.enum(["draft", "active", "rejected"]);
export type RuleStatus = z.infer<typeof RuleStatusSchema>;

export const RuleSchema = z.object({
  id: z.string(),
  runId: z.string(),
  sourceText: z.string(),
  restriction: RestrictionSchema,
  status: RuleStatusSchema,
  activatedBy: z.string().nullable(),
});
export type Rule = z.infer<typeof RuleSchema>;

// ==========================================
// 6.12 Human Actions (Discriminated Union)
// ==========================================

export const ApproveHeldActionSchema = z.object({
  action: z.literal("approve_held"),
});

export const DenyHeldActionSchema = z.object({
  action: z.literal("deny_held"),
});

export const RestoreScopeActionSchema = z.object({
  action: z.literal("restore_scope"),
  grant: GrantSchema,
});

export const UnfreezeActionSchema = z.object({
  action: z.literal("unfreeze"),
});

export const HumanActionSchema = z.discriminatedUnion("action", [
  ApproveHeldActionSchema,
  DenyHeldActionSchema,
  RestoreScopeActionSchema,
  UnfreezeActionSchema,
]);
export type HumanAction = z.infer<typeof HumanActionSchema>;

// ==========================================
// 6.13 Watcher Contract Types
// ==========================================

export const RecentEventSummarySchema = z.object({
  tool: ToolNameSchema,
  target: z.string(),
  outcome: OutcomeSchema,
});
export type RecentEventSummary = z.infer<typeof RecentEventSummarySchema>;

export const WatcherInputSchema = z.object({
  declaredTask: z.string(),
  grants: z.array(GrantSchema),
  action: AgentActionSchema,
  sensitivity: SensitivitySchema,
  recentEvents: z.array(RecentEventSummarySchema).max(10),
  lastReadExcerpt: z.string().max(300).nullable(),
});
export type WatcherInput = z.infer<typeof WatcherInputSchema>;

export const WatcherCallSchema = z.object({
  tier: TierSchema,
  model: z.string(),
  decision: DecisionSchema,
  confidence: z.number().min(0).max(1),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  costUsd: z.number(),
  latencyMs: z.number().int(),
});
export type WatcherCall = z.infer<typeof WatcherCallSchema>;

export const WatcherResultSchema = z.object({
  verdict: VerdictSchema,
  calls: z.array(WatcherCallSchema),
});
export type WatcherResult = z.infer<typeof WatcherResultSchema>;

export class WatcherUnavailableError extends Error {
  constructor(message = "Watcher is unavailable after retry and JSON repair.") {
    super(message);
    this.name = "WatcherUnavailableError";
  }
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}
