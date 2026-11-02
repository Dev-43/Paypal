import { AgentAction, PermissionState, Outcome } from "../../contracts";

export interface HardLimitResult {
  passed: boolean;
  outcome?: Outcome;
  message?: string;
  rule?: "H1" | "H2" | "H3" | "H4" | "H5" | "H6";
}

/**
 * Helper to extract email domain from address or args.
 */
export function extractDomainFromEmail(email: string): string {
  if (!email || typeof email !== "string") return "";
  const parts = email.trim().split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : "";
}

/**
 * Checks whether a given path is within any granted scope prefix for a tool.
 * Scope prefix must end in `/` per BUILD.md 6.2.
 */
export function isPathInScope(path: string, scopes: string[]): boolean {
  if (!path) return false;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return scopes.some((scope) => {
    if (scope === "*") return true;
    const prefix = scope.endsWith("/") ? scope : `${scope}/`;
    return normalizedPath.startsWith(prefix);
  });
}

/**
 * Deterministic Hard Limits H1 - H6 evaluated strictly in order.
 * First failure decides.
 */
export function checkHardLimits(
  action: AgentAction,
  state: PermissionState,
  emailDomainAllowList: string[]
): HardLimitResult {
  const { tool, args, stepIndex } = action;

  // H1: tool is in disabledTools or no grant has this tool -> blocked
  if (state.disabledTools.includes(tool)) {
    return {
      passed: false,
      outcome: "blocked",
      rule: "H1",
      message: `Blocked (H1): tool '${tool}' is disabled for this run.`,
    };
  }

  const toolGrants = state.grants.filter((g) => g.tool === tool);
  if (toolGrants.length === 0) {
    return {
      passed: false,
      outcome: "blocked",
      rule: "H1",
      message: `Blocked (H1): no permission grant exists for tool '${tool}'.`,
    };
  }

  // H2: For file tools, path not under any granted scope for that tool;
  //     For send_email, no grant covers the recipient domain -> blocked
  if (tool === "read_file" || tool === "write_file" || tool === "list_files") {
    const targetPath = (args.path as string) || (args.target as string) || "";
    const allowedScopes = toolGrants.map((g) => g.scope);
    if (!isPathInScope(targetPath, allowedScopes)) {
      return {
        passed: false,
        outcome: "blocked",
        rule: "H2",
        message: `Blocked (H2): path '${targetPath}' is outside the granted scopes for '${tool}'.`,
      };
    }
  } else if (tool === "send_email") {
    const toAddress = (args.to as string) || "";
    const domain = extractDomainFromEmail(toAddress);
    const domainCovered = toolGrants.some((g) => g.scope === "*" || g.scope.toLowerCase() === domain);
    if (!domainCovered) {
      return {
        passed: false,
        outcome: "blocked",
        rule: "H2",
        message: `Blocked (H2): recipient domain '${domain}' is not covered by any grant for send_email.`,
      };
    }
  }

  // H3: Tool is send_email and recipient domain is not in emailDomainAllowList -> held (human approval)
  if (tool === "send_email") {
    const toAddress = (args.to as string) || "";
    const domain = extractDomainFromEmail(toAddress);
    const isAllowListed = emailDomainAllowList.some(
      (allowed) => allowed.toLowerCase() === domain
    );
    if (!isAllowListed) {
      return {
        passed: false,
        outcome: "held",
        rule: "H3",
        message: `Held for human approval (H3): recipient domain '${domain}' is not in the corporate allow-list.`,
      };
    }
  }

  // H4: Tool in approvalRequiredTools -> held
  if (state.approvalRequiredTools.includes(tool)) {
    return {
      passed: false,
      outcome: "held",
      rule: "H4",
      message: `Held for human approval (H4): tool '${tool}' requires approver authorization.`,
    };
  }

  // H5: Tool is send_email and sensitiveRead is true -> held
  if (tool === "send_email" && state.sensitiveRead) {
    return {
      passed: false,
      outcome: "held",
      rule: "H5",
      message: `Held for human approval (H5): sensitive data was accessed earlier in this run; outbound email requires approval.`,
    };
  }

  // H6: stepIndex >= 25 -> blocked and run status completed
  if (stepIndex >= 25) {
    return {
      passed: false,
      outcome: "blocked",
      rule: "H6",
      message: `Blocked (H6): maximum execution budget of 25 steps reached.`,
    };
  }

  return { passed: true };
}
