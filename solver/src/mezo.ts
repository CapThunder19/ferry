import type { Address } from "viem";
import { mezo } from "@ferry/shared/addresses";
import * as abi from "@ferry/shared/abis";
import { nominalCR, type MezoParams } from "@ferry/shared/ferry";
import type { MezoPublic } from "./clients.js";

export { TROVE_STATUS, readMezoParams, readTrove, readTroveStatus as troveStatus } from "@ferry/shared/readers";

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
