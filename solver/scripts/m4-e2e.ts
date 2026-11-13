// M4: full end-to-end migration: Aave position → eth leg → Mezo leg via FerryMezo → VAA → finalize.
import { formatEther, formatUnits, parseUnits } from "viem";
import { fmt, pct } from "@ferry/shared/ferry";
import { ferryEscrowAbi } from "@ferry/shared/ferryArtifacts";
import { makeCtx, sendEthLeg, sendFinalize, sendMezoLeg } from "../src/legs.js";
import { loadDeployments, requireDeployment } from "../src/deployments.js";
import { createAavePosition, ensureSolverUsdc, newTestUser, signMigration } from "../src/testUser.js";
import { readAavePosition } from "../src/aave.js";
import { readTrove } from "../src/mezo.js";
import { MEZO_WORMHOLE_CHAIN_ID, fetchSignedVaa, wormholescanLink } from "../src/wormhole.js";
import { mezoAddr, mezoTx, sepTx, step } from "../src/links.js";

const ctx = makeCtx();
const d = loadDeployments();
const ferryMezo = requireDeployment(d.mezo?.ferryMezo, "FerryMezo");
const escrow = requireDeployment(d.sepolia?.ferryEscrow, "FerryEscrow");

const user = newTestUser("m4-e2e");
step(`1. Aave position for ${user.address}: supply 0.05 WBTC, borrow 1,850 USDC`);
const setup = await createAavePosition(ctx, user, parseUnits("0.05", 8), parseUnits("1850", 6));
console.log(`  borrow ${sepTx(setup.borrow)}`);

step("2. Quote + user signatures (intent, aToken permit, Mezo OpenTrove)");
const { submission, quote } = await signMigration(ctx, user, escrow, ferryMezo);
console.log(`  move ${formatUnits(quote.collateralAmount, 8)} WBTC → ${formatEther(quote.mezoCollateral)} BTC`);
console.log(`  repay ≤ ${formatUnits(quote.maxDebtRepay, 6)} USDC → borrow ${fmt(quote.mezoDebtAmount)} MUSD (solver fee ${fmt(quote.solverFee)}, Mezo fee ${fmt(quote.borrowingFee)}, gas comp 200)`);
console.log(`  trove debt ${fmt(quote.troveDebt)} MUSD, ICR ${pct(quote.icr)}, liquidation at $${fmt(quote.liquidationPrice)}`);
await ensureSolverUsdc(ctx, submission.intent.maxDebtRepay);

step("3. Sepolia: executeEthLeg");
const eth = await sendEthLeg(ctx, escrow, submission);
console.log(`  ${sepTx(eth.hash)}`);

step("4. Mezo: executeMezoLeg");
const mz = await sendMezoLeg(ctx, ferryMezo, eth.intentId, submission);
console.log(`  ${mezoTx(mz.hash)} (gas ${mz.gasUsed})`);
console.log(`  ${wormholescanLink(MEZO_WORMHOLE_CHAIN_ID, ferryMezo, mz.sequence)}`);

step("5. Fetch signed VAA");
const vaa = await fetchSignedVaa(MEZO_WORMHOLE_CHAIN_ID, ferryMezo, mz.sequence, { log: (m) => console.log(`  ${m}`) });

step("6. Sepolia: finalize");
const fin = await sendFinalize(ctx, escrow, vaa);
console.log(`  ${sepTx(fin.hash)}`);

step("Result");
const aave = await readAavePosition(ctx.sep, user.address);
const trove = await readTrove(ctx.mz, user.address);
const e = await ctx.sep.readContract({ address: escrow, abi: ferryEscrowAbi, functionName: "getEscrow", args: [eth.intentId] });
console.log(`  Aave: aWBTC ${aave.collateralAmount}, debt ${aave.debtAmount} (closed)`);
console.log(`  Mezo trove ${mezoAddr(user.address)}: ${trove.status}, ${formatEther(trove.coll)} BTC, ${formatEther(trove.debt)} MUSD @ ${trove.interestRateBps} bps`);
console.log(`  Escrow status ${e.status} (2 = Completed)`);
if (aave.debtAmount !== 0n || trove.status !== "active" || e.status !== 2) throw new Error("M4 verification failed");
console.log("\nM4 OK");
