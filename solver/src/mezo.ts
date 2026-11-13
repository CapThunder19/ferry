import type { Address } from "viem";
import { mezo } from "@ferry/shared/addresses";
import * as abi from "@ferry/shared/abis";
import { nominalCR, type MezoParams } from "@ferry/shared/ferry";
import type { MezoPublic } from "./clients.js";

export const TROVE_STATUS = ["nonExistent", "active", "closedByOwner", "closedByLiquidation", "closedByRedemption"] as const;

/** Live Mezo parameters, always read at the latest block (the public RPC can lag). */
export async function readMezoParams(c: MezoPublic): Promise<MezoParams> {
  const btcPrice = await c.readContract({ address: mezo.priceFeed, abi: abi.priceFeedAbi, functionName: "fetchPrice", blockTag: "latest" });
  const [recoveryMode, borrowingRate, gasCompensation, minNetDebt, interestRate] = await Promise.all([
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "checkRecoveryMode", args: [btcPrice], blockTag: "latest" }),
    c.readContract({ address: mezo.borrowerOperations, abi: abi.borrowerOperationsAbi, functionName: "borrowingRate", blockTag: "latest" }),
    c.readContract({ address: mezo.borrowerOperations, abi: abi.borrowerOperationsAbi, functionName: "MUSD_GAS_COMPENSATION", blockTag: "latest" }),
    c.readContract({ address: mezo.borrowerOperations, abi: abi.borrowerOperationsAbi, functionName: "minNetDebt", blockTag: "latest" }),
    c.readContract({ address: mezo.interestRateManager, abi: abi.interestRateManagerAbi, functionName: "interestRate", blockTag: "latest" }),
  ]);
  return { btcPrice, recoveryMode, borrowingRate, gasCompensation, minNetDebt, interestRateBps: Number(interestRate) };
}

export async function troveStatus(c: MezoPublic, user: Address) {
  const s = await c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTroveStatus", args: [user], blockTag: "latest" });
  return TROVE_STATUS[s] ?? "unknown";
}

export async function readTrove(c: MezoPublic, user: Address) {
  const [status, coll, debt, principal, rate, maxCap] = await Promise.all([
    troveStatus(c, user),
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTroveColl", args: [user], blockTag: "latest" }),
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTroveDebt", args: [user], blockTag: "latest" }),
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTrovePrincipal", args: [user], blockTag: "latest" }),
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTroveInterestRate", args: [user], blockTag: "latest" }),
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTroveMaxBorrowingCapacity", args: [user], blockTag: "latest" }),
  ]);
  return { status, coll, debt, principal, interestRateBps: Number(rate), maxBorrowingCapacity: maxCap };
}

/**
 * Insert hints for a new trove: HintHelpers.getApproxHint, then SortedTroves.findInsertPosition.
 * Computed right before sending; numTrials ~ 15 * sqrt(size) as recommended by Liquity.
 */
export async function computeHints(c: MezoPublic, coll: bigint, troveDebt: bigint) {
  const nicr = nominalCR(coll, troveDebt);
  const size = await c.readContract({ address: mezo.sortedTroves, abi: abi.sortedTrovesAbi, functionName: "getSize", blockTag: "latest" });
  const numTrials = BigInt(Math.max(15, Math.ceil(15 * Math.sqrt(Number(size)))));
  const seed = BigInt(Math.floor(Math.random() * 1e9));
  const [approx] = await c.readContract({
    address: mezo.hintHelpers,
    abi: abi.hintHelpersAbi,
    functionName: "getApproxHint",
    args: [nicr, numTrials, seed],
    blockTag: "latest",
  });
  const [upperHint, lowerHint] = await c.readContract({
    address: mezo.sortedTroves,
    abi: abi.sortedTrovesAbi,
    functionName: "findInsertPosition",
    args: [nicr, approx, approx],
    blockTag: "latest",
  });
  return { upperHint, lowerHint, nicr };
}

export async function mezoNonce(c: MezoPublic, user: Address) {
  return c.readContract({ address: mezo.borrowerOperationsSignatures, abi: abi.borrowerOperationsSignaturesAbi, functionName: "getNonce", args: [user], blockTag: "latest" });
}

/** Expected trove debt for a given debtAmount (what MUSD's _openTrove will record). */
export function expectedTroveDebt(debtAmount: bigint, p: MezoParams) {
  const fee = p.recoveryMode ? 0n : (debtAmount * p.borrowingRate) / 10n ** 18n;
  return debtAmount + fee + p.gasCompensation;
}
