/**
 * Untrusted Text Provenance Tracker (Task 3.4)
 * Records outsider-controlled fields read by the agent (e.g. shipping address, buyer notes, invoice memos)
 * and feeds them to the Watcher to detect indirect prompt injections.
 */

import { getRegistryEntry } from "../paypal/registry";

function extractPathValues(obj: any, path: string): string[] {
  if (!obj || !path) return [];

  const parts = path.split(".");
  let current: any[] = [obj];

  for (const part of parts) {
    const next: any[] = [];
    for (const item of current) {
      if (item === null || item === undefined) continue;

      if (part === "0" && Array.isArray(item)) {
        if (item.length > 0) next.push(item[0]);
      } else if (Array.isArray(item)) {
        for (const sub of item) {
          if (sub && sub[part] !== undefined) next.push(sub[part]);
        }
      } else if (item[part] !== undefined) {
        next.push(item[part]);
      }
    }
    current = next;
  }

  const results: string[] = [];
  for (const val of current) {
    if (typeof val === "string" && val.trim().length > 0) {
      results.push(val.trim());
    } else if (typeof val === "object" && val !== null) {
      results.push(JSON.stringify(val));
    }
  }

  return results;
}

/**
 * Extracts all untrusted text from a tool execution result based on the tool's registry entry.
 */
export function extractUntrustedText(toolName: string, toolResult: any): string[] {
  const entry = getRegistryEntry(toolName);
  if (!entry || !entry.untrustedFieldPaths || entry.untrustedFieldPaths.length === 0) {
    return [];
  }

  const extracted: string[] = [];
  for (const path of entry.untrustedFieldPaths) {
    const values = extractPathValues(toolResult, path);
    extracted.push(...values);
  }

  return extracted;
}
