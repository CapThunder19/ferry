// M3: Aave leg alone. Creates a real Aave position for a fresh test user, then the solver executes the eth leg
// into the SHORT-timeout escrow (so `m4-refund` can later demonstrate the refund path on the same intent).
import { formatUnits, parseUnits } from "viem";
import { ferryEscrowAbi } from "@ferry/shared/ferryArtifacts";
import { makeCtx, sendEthLeg } from "../src/legs.js";
import { loadDeployments, requireDeployment } from "../src/deployments.js";
import { createAavePosition, ensureSolverUsdc, newTestUser, signMigration } from "../src/testUser.js";
import { readAavePosition } from "../src/aave.js";
import { sepAddr, sepTx, step } from "../src/links.js";
import { writeFileSync } from "node:fs";

const ctx = makeCtx();
const d = loadDeployments();
const ferryMezo = requireDeployment(d.mezo?.ferryMezo, "FerryMezo");
const escrow = requireDeployment(d.sepolia?.ferryEscrowShort, "FerryEscrow (short)");

const user = newTestUser("m3");
step(`Create Aave position for ${user.address}: supply 0.05 WBTC, borrow 1,850 USDC`);
const txs = await createAavePosition(ctx, user, parseUnits("0.05", 8), parseUnits("1850", 6));
for (const [k, h] of Object.entries(txs)) console.log(`  ${k}: ${sepTx(h)}`);
const before = await readAavePosition(ctx.sep, user.address);
console.log(`  aWBTC ${formatUnits(before.collateralAmount, 8)}, USDC debt ${formatUnits(before.debtAmount, 6)}, HF ${formatUnits(before.healthFactor, 18)}`);

step("User signs intent + aToken permit (+ Mezo OpenTrove, unused here)");
const { submission } = await signMigration(ctx, user, escrow, ferryMezo);
await ensureSolverUsdc(ctx, submission.intent.maxDebtRepay);

step("Solver executes eth leg");
const res = await sendEthLeg(ctx, escrow, submission);
console.log(`tx ${sepTx(res.hash)}`);
console.log(`intentId ${res.intentId}: escrowed ${formatUnits(res.collateralAmount, 8)} WBTC, repaid ${formatUnits(res.debtRepaid, 6)} USDC`);

const after = await readAavePosition(ctx.sep, user.address);
const e = await ctx.sep.readContract({ address: escrow, abi: ferryEscrowAbi, functionName: "getEscrow", args: [res.intentId] });
console.log(`Aave after: aWBTC ${after.collateralAmount}, debt ${after.debtAmount}; escrow ${sepAddr(escrow)} status ${e.status} (1 = Pending)`);
if (after.debtAmount !== 0n || after.collateralAmount !== 0n || e.status !== 1) throw new Error("M3 verification failed");

writeFileSync(new URL("../data/m3-last.json", import.meta.url), JSON.stringify({ intentId: res.intentId, escrow, user: user.address }, null, 2));
console.log("\nM3 OK — run `npm run m4:refund -w solver` after the short timeout to demonstrate the refund path");
