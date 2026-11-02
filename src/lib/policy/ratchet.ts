import {
  PermissionState,
  Restriction,
  RestrictionSchema,
  Grant,
  ToolNameSchema,
  HumanAction,
} from "../../contracts";

/**
 * Validates whether an untrusted input conforms strictly to a valid tightening restriction.
 * Returns the parsed Restriction if valid, or null if invalid/malformed/widening.
 */
export function validateRestriction(x: unknown): Restriction | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) {
    return null;
  }

  const candidate = x as Record<string, unknown>;

  // Check kind
  if (
    candidate.kind !== "revoke_scope" &&
    candidate.kind !== "disable_tool" &&
    candidate.kind !== "require_approval" &&
    candidate.kind !== "freeze_run"
  ) {
    return null;
  }

  // Check for suspicious extra keys attempting widening or injection
  const allowedKeysByKind: Record<string, string[]> = {
    revoke_scope: ["kind", "tool", "scope"],
    disable_tool: ["kind", "tool"],
    require_approval: ["kind", "tool"],
    freeze_run: ["kind"],
  };

  const allowedKeys = allowedKeysByKind[candidate.kind];
  const candidateKeys = Object.keys(candidate);
  if (candidateKeys.some((k) => !allowedKeys.includes(k))) {
    return null;
  }

  // Validate tool if present
  if ("tool" in candidate) {
    const parsedTool = ToolNameSchema.safeParse(candidate.tool);
    if (!parsedTool.success) {
      return null;
    }
  }

  // Validate scope if revoke_scope
  if (candidate.kind === "revoke_scope") {
    if (typeof candidate.scope !== "string" || candidate.scope.trim().length === 0) {
      return null;
    }
  }

  const parsed = RestrictionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Applies a single restriction to the permission state.
 * Guaranteed to only shrink permissions, never widen.
 * Version is incremented by exactly 1.
 */
export function applyRestriction(
  state: PermissionState,
  restriction: Restriction,
  by: "watcher" | "interpreter_rule" | "hard_limit" | "human"
): PermissionState {
  const at = new Date().toISOString();
  let updatedGrants = [...state.grants];
  let updatedDisabled = [...state.disabledTools];
  let updatedApproval = [...state.approvalRequiredTools];
  let updatedFrozen = state.frozen;

  switch (restriction.kind) {
    case "revoke_scope": {
      // Remove any grant that matches this tool and scope
      updatedGrants = updatedGrants.filter(
        (g) => !(g.tool === restriction.tool && g.scope === restriction.scope)
      );
      break;
    }
    case "disable_tool": {
      if (!updatedDisabled.includes(restriction.tool)) {
        updatedDisabled.push(restriction.tool);
      }
      break;
    }
    case "require_approval": {
      if (!updatedApproval.includes(restriction.tool)) {
        updatedApproval.push(restriction.tool);
      }
      break;
    }
    case "freeze_run": {
      updatedFrozen = true;
      break;
    }
  }

  return {
    ...state,
    version: state.version + 1,
    grants: updatedGrants,
    disabledTools: updatedDisabled,
    approvalRequiredTools: updatedApproval,
    frozen: updatedFrozen,
    restrictionLog: [
      ...state.restrictionLog,
      {
        at,
        by,
        restriction,
      },
    ],
  };
}

/**
 * Restores a scope grant.
 * This is the ONLY function permitted to widen or add a grant.
 * Can only be invoked via authenticated human action.
 */
export function restoreScope(state: PermissionState, grant: Grant): PermissionState {
  const alreadyExists = state.grants.some(
    (g) => g.tool === grant.tool && g.scope === grant.scope
  );
  const newGrants = alreadyExists ? state.grants : [...state.grants, grant];

  return {
    ...state,
    version: state.version + 1,
    grants: newGrants,
    restrictionLog: [
      ...state.restrictionLog,
      {
        at: new Date().toISOString(),
        by: "human",
        restriction: {
          kind: "revoke_scope",
          tool: grant.tool,
          scope: `RESTORED:${grant.scope}`,
        },
      },
    ],
  };
}

/**
 * Unfreezes a frozen run.
 * Can only be invoked via authenticated human action.
 */
export function unfreezeRun(state: PermissionState): PermissionState {
  return {
    ...state,
    version: state.version + 1,
    frozen: false,
    restrictionLog: [
      ...state.restrictionLog,
      {
        at: new Date().toISOString(),
        by: "human",
        restriction: {
          kind: "freeze_run",
        },
      },
    ],
  };
}

/**
 * Applies an authenticated human action to permission state.
 */
export function applyHumanAction(
  state: PermissionState,
  action: HumanAction
): PermissionState {
  switch (action.action) {
    case "restore_scope":
      return restoreScope(state, action.grant);
    case "unfreeze":
      return unfreezeRun(state);
    case "approve_held":
    case "deny_held":
      // These actions affect held action execution flow, not permission state definitions
      return state;
  }
}

/**
 * Activates a drafted rule from the Interpreter (P2 feature).
 * Applies restriction to permission state.
 */
export function activateRuleOnState(
  state: PermissionState,
  restriction: Restriction
): PermissionState {
  return applyRestriction(state, restriction, "interpreter_rule");
}
