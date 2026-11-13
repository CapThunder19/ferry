// Shared Ferry logic used by the solver and the app: EIP-712 typed data and the migration quote maths.
import type { Address, Hex } from "viem";
import { decodeAbiParameters } from "viem";
import { MEZO_CHAIN_ID, SEPOLIA_CHAIN_ID, mezo } from "./addresses";

// ------------------------------------------------------------------ types

export type MigrationIntent = {
  user: Address;
  collateralAsset: Address;
  collateralAmount: bigint;
  debtAsset: Address;
  maxDebtRepay: bigint;
  mezoCollateral: bigint;
  mezoDebtAmount: bigint;
  solverFeeBps: bigint;
  nonce: bigint;
  deadline: bigint;
};

export type Permit = { value: bigint; deadline: bigint; v: number; r: Hex; s: Hex };

/** What the frontend POSTs to the solver. */
export type IntentSubmission = {
  intent: MigrationIntent;
  intentSignature: Hex;
  permit: Permit;
  mezoSignature: Hex;
  mezoDeadline: bigint;
};

// ------------------------------------------------------------------ EIP-712

export const migrationIntentTypes = {
  MigrationIntent: [
    { name: "user", type: "address" },
    { name: "collateralAsset", type: "address" },
    { name: "collateralAmount", type: "uint256" },
    { name: "debtAsset", type: "address" },
    { name: "maxDebtRepay", type: "uint256" },
    { name: "mezoCollateral", type: "uint256" },
    { name: "mezoDebtAmount", type: "uint256" },
    { name: "solverFeeBps", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const ferryEscrowDomain = (escrow: Address) =>
  ({ name: "FerryEscrow", version: "1", chainId: SEPOLIA_CHAIN_ID, verifyingContract: escrow }) as const;

/** Mezo BorrowerOperationsSignatures OpenTrove (verified on chain by env-check). */
export const openTroveTypes = {
  OpenTrove: [
    { name: "assetAmount", type: "uint256" },
    { name: "debtAmount", type: "uint256" },
    { name: "borrower", type: "address" },
    { name: "recipient", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const openTroveDomain = {
  name: "BorrowerOperationsSignatures",
  version: "1",
  chainId: MEZO_CHAIN_ID,
  verifyingContract: mezo.borrowerOperationsSignatures,
} as const;

export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Aave aTokens use EIP712 revision "1" and their token name. */
export const aTokenPermitDomain = (aToken: Address, name: string) =>
  ({ name, version: "1", chainId: SEPOLIA_CHAIN_ID, verifyingContract: aToken }) as const;

// ------------------------------------------------------------------ Wormhole payload

export type MezoProof = {
  version: number;
  intentId: Hex;
  user: Address;
  troveColl: bigint;
  troveDebt: bigint;
  solver: Address;
};

export function decodeMezoProof(payload: Hex): MezoProof {
  const [version, intentId, user, troveColl, troveDebt, solver] = decodeAbiParameters(
    [{ type: "uint8" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }],
    payload,
  );
  return { version, intentId, user, troveColl, troveDebt, solver };
}

// ------------------------------------------------------------------ quote maths

export const WAD = 10n ** 18n;
export const BPS = 10_000n;
export const MCR = 11n * 10n ** 17n; // 110%
export const CCR = 15n * 10n ** 17n; // 150%
export const MIN_ICR = 12n * 10n ** 17n; // Ferry policy: 120% hard minimum
export const DEFAULT_SOLVER_FEE_BPS = 30n; // 0.30%
/** Headroom on the Aave debt for interest accrued between signing and execution. */
export const DEBT_BUFFER_BPS = 20n; // 0.20%

export type MezoParams = {
  btcPrice: bigint; // 1e18 USD per BTC (Mezo PriceFeed)
  borrowingRate: bigint; // 1e18 = 100%
  gasCompensation: bigint; // 200e18
  minNetDebt: bigint; // 1800e18
  interestRateBps: number; // 100 = 1%
  recoveryMode: boolean;
};

export type AavePosition = {
  collateralAmount: bigint; // aWBTC balance, 8 decimals
  debtAmount: bigint; // variable debt, debt asset decimals
  debtDecimals: number;
  variableBorrowAprRay: bigint; // currentVariableBorrowRate, 1e27
};

export type Quote = {
  collateralAmount: bigint; // WBTC 8 dec
  maxDebtRepay: bigint; // debt asset units
  mezoCollateral: bigint; // BTC 18 dec
  mezoDebtAmount: bigint; // MUSD the user borrows on Mezo (goes to the solver)
  solverFeeBps: bigint;
  solverFee: bigint; // MUSD
  borrowingFee: bigint; // MUSD (Mezo, 0.1%)
  netDebt: bigint; // MUSD: debtAmount + borrowing fee
  troveDebt: bigint; // MUSD: net debt + 200 gas compensation (returned on close)
  icr: bigint; // 1e18
  liquidationPrice: bigint; // 1e18 USD per BTC
  maxBorrowingCapacity: bigint; // coll * price / 1.1
  aaveAprPct: number;
  mezoAprPct: number;
  yearlySavingsUsd: number;
  errors: string[];
  warnings: string[];
};

const toWad = (amount: bigint, decimals: number) =>
  decimals <= 18 ? amount * 10n ** BigInt(18 - decimals) : amount / 10n ** BigInt(decimals - 18);

export function quoteMigration(
  pos: AavePosition,
  mz: MezoParams,
  solverFeeBps = DEFAULT_SOLVER_FEE_BPS,
  debtBufferBps = DEBT_BUFFER_BPS,
): Quote {
  const errors: string[] = [];
  const warnings: string[] = [];

  const collateralAmount = pos.collateralAmount;
  const mezoCollateral = collateralAmount * 10n ** 10n; // WBTC 8 dec -> BTC 18 dec, 1:1
  const maxDebtRepay = (pos.debtAmount * (BPS + debtBufferBps) + BPS - 1n) / BPS;
  const repayWad = toWad(maxDebtRepay, pos.debtDecimals);
  const mezoDebtAmount = (repayWad * (BPS + solverFeeBps) + BPS - 1n) / BPS;
  const solverFee = mezoDebtAmount - repayWad;

  const borrowingFee = mz.recoveryMode ? 0n : (mezoDebtAmount * mz.borrowingRate) / WAD;
  const netDebt = mezoDebtAmount + borrowingFee;
  const troveDebt = netDebt + mz.gasCompensation;
  const collValue = (mezoCollateral * mz.btcPrice) / WAD;
  const icr = troveDebt === 0n ? 0n : (collValue * WAD) / troveDebt;
  const liquidationPrice = mezoCollateral === 0n ? 0n : (troveDebt * MCR) / mezoCollateral;
  const maxBorrowingCapacity = (collValue * WAD) / MCR;

  const aaveAprPct = Number(pos.variableBorrowAprRay) / 1e25;
  const mezoAprPct = mz.interestRateBps / 100;
  const debtUsd = Number(toWad(pos.debtAmount, pos.debtDecimals)) / 1e18;
  const yearlySavingsUsd = debtUsd * (aaveAprPct - mezoAprPct) / 100;

  if (pos.debtAmount === 0n) errors.push("No variable debt on Aave to migrate.");
  if (collateralAmount === 0n) errors.push("No WBTC collateral on Aave.");
  if (netDebt < mz.minNetDebt)
    errors.push(`Mezo needs at least ${fmt(mz.minNetDebt)} MUSD of net debt; this migration would create ${fmt(netDebt)}.`);
  if (icr < MIN_ICR) errors.push(`Resulting Mezo collateral ratio ${pct(icr)} is below Ferry's 120% minimum.`);
  if (mz.recoveryMode) {
    if (icr < CCR) errors.push("Mezo is in Recovery Mode: new troves need at least 150% collateral ratio.");
    else warnings.push("Mezo is in Recovery Mode: collateral withdrawals are blocked while it lasts.");
  } else if (icr < CCR) {
    warnings.push(`Collateral ratio ${pct(icr)} is below 150%. If Mezo enters Recovery Mode you could be liquidated below 150%.`);
  }
  warnings.push("Your debt changes from USDC/USDT to MUSD (a BTC-backed stablecoin).");
  warnings.push("Mezo's 1% rate is promotional; the fixed rate is set per trove at open (range 1–5%).");

  return {
    collateralAmount,
    maxDebtRepay,
    mezoCollateral,
    mezoDebtAmount,
    solverFeeBps,
    solverFee,
    borrowingFee,
    netDebt,
    troveDebt,
    icr,
    liquidationPrice,
    maxBorrowingCapacity,
    aaveAprPct,
    mezoAprPct,
    yearlySavingsUsd,
    errors,
    warnings,
  };
}

/** Nominal collateral ratio used by SortedTroves (coll * 1e20 / debt). */
export const nominalCR = (coll: bigint, debt: bigint) => (debt === 0n ? 0n : (coll * 10n ** 20n) / debt);

export const fmt = (wad: bigint, digits = 2) =>
  (Number(wad) / 1e18).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const pct = (wad: bigint) => `${(Number(wad) / 1e16).toFixed(1)}%`;
