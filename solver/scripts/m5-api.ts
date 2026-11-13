// M5: runs a migration through the solver's HTTP API (solver must be running: `npm start -w solver`).
// Creates a test Aave position, signs like the frontend would, POSTs /intents and polls GET /intents/:id.
import { parseUnits } from "viem";
import { makeCtx } from "../src/legs.js";
import { loadDeployments, requireDeployment } from "../src/deployments.js";
import { createAavePosition, newTestUser, signMigration } from "../src/testUser.js";
import { optionalEnv } from "../src/env.js";
import { toJson } from "../src/store.js";
import { step } from "../src/links.js";

const API = optionalEnv("SOLVER_URL") ?? "http://localhost:8787";
const TEST_WBTC = optionalEnv("FERRY_TEST_WBTC") ?? "0.045";
const TEST_BORROW = optionalEnv("FERRY_TEST_BORROW") ?? "1850";
const ctx = makeCtx();
const d = loadDeployments();
const escrow = requireDeployment(d.sepolia?.ferryEscrow, "FerryEscrow");
const ferryMezo = requireDeployment(d.mezo?.ferryMezo, "FerryMezo");

const user = newTestUser("m5-api");
step(`Aave position for ${user.address}`);
await createAavePosition(ctx, user, parseUnits(TEST_WBTC, 8), parseUnits(TEST_BORROW, 6));

step("Sign + POST /intents");
const { submission } = await signMigration(ctx, user, escrow, ferryMezo);
const body = toJson(submission).replace(/"(-?\d+)n"/g, '"$1"');
const res = await fetch(`${API}/intents`, { method: "POST", headers: { "content-type": "application/json" }, body });
const json = (await res.json()) as { id?: string; status?: string; reasons?: string[] };
console.log(`HTTP ${res.status}`, json.reasons ?? { id: json.id, status: json.status });
if (!res.ok) process.exit(1);

step("Poll GET /intents/:id");
let last = "";
for (;;) {
  const r = (await (await fetch(`${API}/intents/${json.id}`)).json()) as { status: string; txs: Record<string, string>; error?: string };
  if (r.status !== last) console.log(`${new Date().toISOString()} ${r.status} ${JSON.stringify(r.txs)}${r.error ? ` (${r.error})` : ""}`);
  last = r.status;
  if (["Completed", "Failed", "Refunded"].includes(r.status)) break;
  await new Promise((x) => setTimeout(x, 5_000));
}
console.log(`\nM5 ${last === "Completed" ? "OK" : last}`);
