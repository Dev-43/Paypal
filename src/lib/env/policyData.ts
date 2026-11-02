import { Sensitivity } from "../../contracts";

/**
 * Corporate email domain allow-list per BUILD.md 11.1
 */
export const emailDomainAllowList: string[] = [
  "acme-finance.example",
  "acme-corp.example",
];

/**
 * Deterministic sensitivity classification for mock company paths.
 * Rules per BUILD.md 11.1:
 * - /hr/ = sensitive
 * - /finance/ = internal
 * - anything else = public
 */
export function getSensitivity(path: string): Sensitivity {
  if (!path) return "public";
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (normalized.startsWith("/hr/")) {
    return "sensitive";
  }

  if (normalized.startsWith("/finance/")) {
    return "internal";
  }

  return "public";
}
