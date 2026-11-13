import type { Address } from "viem";
import { sepolia } from "@ferry/shared/addresses";
import * as abi from "@ferry/shared/abis";
import type { AavePosition } from "@ferry/shared/ferry";
import type { SepoliaPublic } from "./clients.js";

export async function reserveTokens(c: SepoliaPublic, asset: Address) {
  const r = await c.readContract({ address: sepolia.aavePool, abi: abi.aavePoolAbi, functionName: "getReserveData", args: [asset] });
  return { aToken: r.aTokenAddress, variableDebtToken: r.variableDebtTokenAddress, variableBorrowAprRay: r.currentVariableBorrowRate };
}

export async function readAavePosition(c: SepoliaPublic, user: Address, debtAsset: Address = sepolia.usdc): Promise<AavePosition & {
  aToken: Address;
  aTokenName: string;
  healthFactor: bigint;
  totalDebtBase: bigint;
  totalCollateralBase: bigint;
}> {
  const [coll, debt] = await Promise.all([reserveTokens(c, sepolia.wbtc), reserveTokens(c, debtAsset)]);
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
