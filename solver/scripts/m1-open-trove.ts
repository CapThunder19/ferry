// M1: Mezo leg alone. A fresh test user signs OpenTrove; the solver calls openTroveWithSignature with BTC.
import { formatEther } from "viem";
import { mezo } from "@ferry/shared/addresses";
import * as abi from "@ferry/shared/abis";
import { WAD, openTroveDomain, openTroveTypes } from "@ferry/shared/ferry";
import { makeCtx } from "../src/legs.js";
import { computeHints, expectedTroveDebt, mezoNonce, readMezoParams, readTrove } from "../src/mezo.js";
import { newTestUser } from "../src/testUser.js";
import { mezoAddr, mezoTx, step } from "../src/links.js";

const ctx = makeCtx();
const user = newTestUser("m1");
const solver = ctx.mzW.account.address;

step("Read live Mezo parameters");
const p = await readMezoParams(ctx.mz);
if (p.recoveryMode) throw new Error("Mezo is in Recovery Mode");
const debtAmount = p.minNetDebt + 10n * WAD; // just above the minimum after the 0.1% fee
const troveDebt = expectedTroveDebt(debtAmount, p);
const targetIcr = 160n; // %
const coll = (troveDebt * targetIcr * WAD) / (100n * p.btcPrice) + 1n;
console.log(`BTC $${formatEther(p.btcPrice)} · debtAmount ${formatEther(debtAmount)} MUSD · trove debt ${formatEther(troveDebt)} · collateral ${formatEther(coll)} BTC (~${targetIcr}% ICR)`);

const bal = await ctx.mz.getBalance({ address: solver });
if (bal < coll + WAD / 1000n) throw new Error(`Solver has ${formatEther(bal)} BTC on Mezo, needs ~${formatEther(coll)} + gas. Fund ${solver}`);

step(`User ${user.address} signs OpenTrove (recipient = solver)`);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const nonce = await mezoNonce(ctx.mz, user.address);
const signature = await user.signTypedData({
  domain: openTroveDomain,
  types: openTroveTypes,
  primaryType: "OpenTrove",
  message: { assetAmount: coll, debtAmount, borrower: user.address, recipient: solver, nonce, deadline },
});

step("Solver calls openTroveWithSignature with BTC");
const { upperHint, lowerHint } = await computeHints(ctx.mz, coll, troveDebt);
const musdBefore = await ctx.mz.readContract({ address: mezo.musd, abi: abi.erc20Abi, functionName: "balanceOf", args: [solver] });
const { request } = await ctx.mz.simulateContract({
  account: ctx.mzW.account,
  address: mezo.borrowerOperationsSignatures,
  abi: abi.borrowerOperationsSignaturesAbi,
  functionName: "openTroveWithSignature",
  args: [debtAmount, upperHint, lowerHint, user.address, solver, signature, deadline],
  value: coll,
});
const hash = await ctx.mzW.writeContract(request);
const receipt = await ctx.mz.waitForTransactionReceipt({ hash });
console.log(`tx ${mezoTx(hash)} — ${receipt.status}, gas ${receipt.gasUsed}`);

step("Verify");
const t = await readTrove(ctx.mz, user.address);
const musdAfter = await ctx.mz.readContract({ address: mezo.musd, abi: abi.erc20Abi, functionName: "balanceOf", args: [solver] });
console.log(`trove owner ${mezoAddr(user.address)}: status ${t.status}, coll ${formatEther(t.coll)} BTC, debt ${formatEther(t.debt)} MUSD, rate ${t.interestRateBps} bps`);
console.log(`MUSD received by recipient (solver): ${formatEther(musdAfter - musdBefore)}`);
if (t.status !== "active" || t.coll !== coll || musdAfter - musdBefore !== debtAmount) throw new Error("M1 verification failed");
console.log("\nM1 OK");
