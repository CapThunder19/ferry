// Solver-side transactions for each leg. Used by the milestone scripts and the solver service.
import { maxUint256, parseEventLogs, type Address, type Hex } from "viem";
import { mezo } from "@ferry/shared/addresses";
import * as abi from "@ferry/shared/abis";
import { ferryEscrowAbi, ferryMezoAbi } from "@ferry/shared/ferryArtifacts";
import type { IntentSubmission } from "@ferry/shared/ferry";
import { mezoPublic, mezoWallet, sepoliaPublic, sepoliaWallet } from "./clients.js";
import { computeHints, expectedTroveDebt, readMezoParams } from "./mezo.js";
import { retry } from "./retry.js";

export type Ctx = {
  sep: ReturnType<typeof sepoliaPublic>;
  sepW: ReturnType<typeof sepoliaWallet>;
  mz: ReturnType<typeof mezoPublic>;
  mzW: ReturnType<typeof mezoWallet>;
};

export const makeCtx = (): Ctx => ({ sep: sepoliaPublic(), sepW: sepoliaWallet(), mz: mezoPublic(), mzW: mezoWallet() });

/** Approves the escrow to pull the solver's debt asset (once, max). */
export async function ensureSolverAllowance(ctx: Ctx, escrow: Address, debtAsset: Address, needed: bigint) {
  const owner = ctx.sepW.account.address;
  const allowance = await ctx.sep.readContract({ address: debtAsset, abi: abi.erc20Abi, functionName: "allowance", args: [owner, escrow] });
  if (allowance >= needed) return undefined;
  const hash = await ctx.sepW.writeContract({ address: debtAsset, abi: abi.erc20Abi, functionName: "approve", args: [escrow, maxUint256] });
  await ctx.sep.waitForTransactionReceipt({ hash });
  return hash;
}

export async function sendEthLeg(ctx: Ctx, escrow: Address, sub: IntentSubmission) {
  await ensureSolverAllowance(ctx, escrow, sub.intent.debtAsset, sub.intent.maxDebtRepay);
  const { request, result: intentId } = await retry(() => ctx.sep.simulateContract({
    account: ctx.sepW.account,
    address: escrow,
    abi: ferryEscrowAbi,
    functionName: "executeEthLeg",
    args: [sub.intent, sub.intentSignature, sub.permit],
  }), { label: "simulate executeEthLeg" });
  const hash = await ctx.sepW.writeContract(request);
  const receipt = await ctx.sep.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`executeEthLeg reverted: ${hash}`);
  const [ev] = parseEventLogs({ abi: ferryEscrowAbi, logs: receipt.logs, eventName: "EthLegExecuted" });
  return { hash, intentId: intentId as Hex, collateralAmount: ev.args.collateralAmount, debtRepaid: ev.args.debtRepaid };
}

export async function sendMezoLeg(ctx: Ctx, ferryMezo: Address, intentId: Hex, sub: IntentSubmission) {
  const params = await readMezoParams(ctx.mz);
  if (params.recoveryMode) throw new Error("Mezo is in Recovery Mode — refusing to open a trove");
  const troveDebt = expectedTroveDebt(sub.intent.mezoDebtAmount, params);
  const { upperHint, lowerHint } = await computeHints(ctx.mz, sub.intent.mezoCollateral, troveDebt);
  const fee = await ctx.mz.readContract({ address: mezo.wormholeCore, abi: abi.wormholeAbi, functionName: "messageFee" });

  const leg = {
    intentId,
    user: sub.intent.user,
    mezoCollateral: sub.intent.mezoCollateral,
    mezoDebtAmount: sub.intent.mezoDebtAmount,
    upperHint,
    lowerHint,
    mezoSignature: sub.mezoSignature,
    deadline: sub.mezoDeadline,
  };
  const { request } = await retry(() => ctx.mz.simulateContract({
    account: ctx.mzW.account,
    address: ferryMezo,
    abi: ferryMezoAbi,
    functionName: "executeMezoLeg",
    args: [leg],
    value: sub.intent.mezoCollateral + fee,
  }), { label: "simulate executeMezoLeg" });
  const hash = await ctx.mzW.writeContract(request);
  const receipt = await ctx.mz.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`executeMezoLeg reverted: ${hash}`);
  const [ev] = parseEventLogs({ abi: ferryMezoAbi, logs: receipt.logs, eventName: "MezoLegExecuted" });
  return { hash, sequence: ev.args.sequence, troveColl: ev.args.troveColl, troveDebt: ev.args.troveDebt, gasUsed: receipt.gasUsed };
}

export async function sendFinalize(ctx: Ctx, escrow: Address, vaa: Hex) {
  const { request } = await retry(() => ctx.sep.simulateContract({
    account: ctx.sepW.account,
    address: escrow,
    abi: ferryEscrowAbi,
    functionName: "finalize",
    args: [vaa],
  }), { label: "simulate finalize" });
  const hash = await ctx.sepW.writeContract(request);
  const receipt = await ctx.sep.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`finalize reverted: ${hash}`);
  return { hash };
}

export async function sendRefund(ctx: Ctx, escrow: Address, intentId: Hex) {
  const { request } = await retry(() => ctx.sep.simulateContract({
    account: ctx.sepW.account,
    address: escrow,
    abi: ferryEscrowAbi,
    functionName: "refund",
    args: [intentId],
  }), { label: "simulate refund" });
  const hash = await ctx.sepW.writeContract(request);
  const receipt = await ctx.sep.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`refund reverted: ${hash}`);
  const [ev] = parseEventLogs({ abi: ferryEscrowAbi, logs: receipt.logs, eventName: "Refunded" });
  return { hash, toSolver: ev.args.toSolver, toUser: ev.args.toUser };
}
