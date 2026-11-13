// M4 refund path: refunds the pending intent from m3-eth-leg after the escrow timeout.
import { readFileSync } from "node:fs";
import { formatUnits, type Address, type Hex } from "viem";
import { ferryEscrowAbi } from "@ferry/shared/ferryArtifacts";
import { makeCtx, sendRefund } from "../src/legs.js";
import { sepTx, step } from "../src/links.js";

const ctx = makeCtx();
const last = JSON.parse(readFileSync(new URL("../data/m3-last.json", import.meta.url), "utf8")) as { intentId: Hex; escrow: Address; user: Address };

const at = await ctx.sep.readContract({ address: last.escrow, abi: ferryEscrowAbi, functionName: "refundableAt", args: [last.intentId] });
const now = BigInt(Math.floor(Date.now() / 1000));
if (now < at) {
  console.log(`Refundable in ${at - now}s — waiting…`);
  await new Promise((r) => setTimeout(r, Number(at - now + 15n) * 1000));
}

step(`Refund ${last.intentId}`);
const e = await ctx.sep.readContract({ address: last.escrow, abi: ferryEscrowAbi, functionName: "getEscrow", args: [last.intentId] });
const r = await sendRefund(ctx, last.escrow, last.intentId);
console.log(`tx ${sepTx(r.hash)}`);
console.log(`escrowed ${formatUnits(e.collateralAmount, 8)} WBTC, solver repaid ${formatUnits(e.debtRepaid, 6)} USDC`);
console.log(`→ solver ${formatUnits(r.toSolver, 8)} WBTC (worth what it repaid), user ${formatUnits(r.toUser, 8)} WBTC (their equity)`);
console.log("\nM4 refund path OK");
