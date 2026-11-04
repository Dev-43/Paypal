/**
 * Standalone Sandbox Seeding CLI Script (Task 1.6)
 * Usage: npx tsx --env-file=.env.local scripts/seed-sandbox.ts [--force]
 */

import { seedSandboxObjects } from "../src/lib/paypal/seed";

async function main() {
  const force = process.argv.includes("--force");
  console.log("=== Pawl PayPal Sandbox Seeding Tool ===");
  console.log(`Force refresh: ${force}`);

  const manifest = await seedSandboxObjects(force);

  console.log(`\nEnvironment: ${manifest.environment}`);
  console.log(`Seeded At:   ${manifest.seededAt}`);
  console.log("\nProvisioned Scenario Objects:");
  console.table(
    Object.values(manifest.objects).map((obj) => ({
      Scenario: obj.scenarioId,
      Order: obj.orderId,
      Capture: obj.captureId,
      Amount: `$${obj.amount} ${obj.currency}`,
      Mode: obj.mode,
      Description: obj.description.slice(0, 45) + "...",
    }))
  );
  console.log("\nSaved manifest to .sandbox-cache.json");
}

main().catch(console.error);
