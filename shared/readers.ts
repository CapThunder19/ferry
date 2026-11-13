// On-chain readers shared by the solver and the app. Mezo reads are pinned to "latest" (the public RPC can lag).
import type { Address, PublicClient } from "viem";
import { mezo, sepolia } from "./addresses";
import * as abi from "./abis";
import type { AavePosition, MezoParams } from "./ferry";

type Client = Pick<PublicClient, "readContract">;

export const TROVE_STATUS = ["nonExistent", "active", "closedByOwner", "closedByLiquidation", "closedByRedemption"] as const;
export type TroveStatus = (typeof TROVE_STATUS)[number] | "unknown";

export async function readMezoParams(c: Client): Promise<MezoParams> {
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

export async function readTroveStatus(c: Client, user: Address): Promise<TroveStatus> {
  const s = await c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTroveStatus", args: [user], blockTag: "latest" });
  return TROVE_STATUS[s] ?? "unknown";
}

export async function readTrove(c: Client, user: Address) {
  const [status, coll, debt, principal, rate, maxCap] = await Promise.all([
    readTroveStatus(c, user),
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTroveColl", args: [user], blockTag: "latest" }),
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTroveDebt", args: [user], blockTag: "latest" }),
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTrovePrincipal", args: [user], blockTag: "latest" }),
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTroveInterestRate", args: [user], blockTag: "latest" }),
    c.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTroveMaxBorrowingCapacity", args: [user], blockTag: "latest" }),
  ]);
  return { status, coll, debt, principal, interestRateBps: Number(rate), maxBorrowingCapacity: maxCap };
}

export async function readReserve(c: Client, asset: Address) {
  const r = await c.readContract({ address: sepolia.aavePool, abi: abi.aavePoolAbi, functionName: "getReserveData", args: [asset] });
  return { aToken: r.aTokenAddress, variableDebtToken: r.variableDebtTokenAddress, variableBorrowAprRay: r.currentVariableBorrowRate };
}

export type FullAavePosition = AavePosition & {
  aToken: Address;
  aTokenName: string;
  healthFactor: bigint;
  totalDebtBase: bigint;
  totalCollateralBase: bigint;
};

export async function readAavePosition(c: Client, user: Address, debtAsset: Address = sepolia.usdc): Promise<FullAavePosition> {
  const [coll, debt] = await Promise.all([readReserve(c, sepolia.wbtc), readReserve(c, debtAsset)]);
  const [collateralAmount, debtAmount, debtDecimals, aTokenName, account] = await Promise.all([
    c.readContract({ address: coll.aToken, abi: abi.erc20Abi, functionName: "balanceOf", args: [user] }),
    c.readContract({ address: debt.variableDebtToken, abi: abi.erc20Abi, functionName: "balanceOf", args: [user] }),
    c.readContract({ address: debtAsset, abi: abi.erc20Abi, functionName: "decimals" }),
    c.readContract({ address: coll.aToken, abi: abi.erc20Abi, functionName: "name" }),
    c.readContract({ address: sepolia.aavePool, abi: abi.aavePoolAbi, functionName: "getUserAccountData", args: [user] }),
  ]);
  return {
    collateralAmount,
    debtAmount,
    debtDecimals,
    variableBorrowAprRay: debt.variableBorrowAprRay,
    aToken: coll.aToken,
    aTokenName,
    totalCollateralBase: account[0],
    totalDebtBase: account[1],
    healthFactor: account[5],
  };
}

/** Aave variable borrow APR (%) for a reserve and Mezo's fixed rate (%). */
export async function readRates(sep: Client, mz: Client, debtAsset: Address = sepolia.usdc) {
  const [r, ir] = await Promise.all([
    readReserve(sep, debtAsset),
    mz.readContract({ address: mezo.interestRateManager, abi: abi.interestRateManagerAbi, functionName: "interestRate", blockTag: "latest" }),
  ]);
  return { aaveAprPct: Number(r.variableBorrowAprRay) / 1e25, mezoAprPct: Number(ir) / 100 };
}
