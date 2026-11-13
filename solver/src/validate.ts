// Off-chain validation before the solver commits any funds (§4.2 step 2 of the brief).
import { formatEther, formatUnits, hashTypedData, type Address, type Hex } from "viem";
import { mezo, sepolia } from "@ferry/shared/addresses";
import * as abi from "@ferry/shared/abis";
import { ferryEscrowAbi, ferryMezoAbi } from "@ferry/shared/ferryArtifacts";
import {
  BPS,
  MIN_ICR,
  WAD,
  aTokenPermitDomain,
  ferryEscrowDomain,
  migrationIntentTypes,
  openTroveDomain,
  openTroveTypes,
  pct,
  permitTypes,
  quoteMigration,
  type IntentSubmission,
  type Quote,
} from "@ferry/shared/ferry";
import type { Ctx } from "./legs.js";
import { readAavePosition } from "./aave.js";
import { computeHints, expectedTroveDebt, mezoNonce, readMezoParams, troveStatus } from "./mezo.js";

export type SolverPolicy = {
  minFeeBps: bigint;
  /** BTC kept on Mezo for gas. */
  mezoGasReserve: bigint;
};

export const DEFAULT_POLICY: SolverPolicy = { minFeeBps: 30n, mezoGasReserve: WAD / 1000n };

export class ValidationError extends Error {
  constructor(public reasons: string[]) {
    super(reasons.join("; "));
  }
}

export type Validated = { intentId: Hex; quote: Quote };

export async function validateSubmission(
  ctx: Ctx,
  escrow: Address,
  ferryMezo: Address,
  sub: IntentSubmission,
  policy: SolverPolicy = DEFAULT_POLICY,
): Promise<Validated> {
  const { intent } = sub;
  const errors: string[] = [];
  const now = BigInt(Math.floor(Date.now() / 1000));

  // --- deadlines
  if (intent.deadline < now + 300n) errors.push("intent deadline is less than 5 minutes away");
  if (sub.permit.deadline < now + 300n) errors.push("permit deadline is less than 5 minutes away");
  if (sub.mezoDeadline < now + 600n) errors.push("Mezo signature deadline is less than 10 minutes away");

  // --- signatures
  const intentId = hashTypedData({ domain: ferryEscrowDomain(escrow), types: migrationIntentTypes, primaryType: "MigrationIntent", message: intent });
  const onChainId = await ctx.sep.readContract({ address: escrow, abi: ferryEscrowAbi, functionName: "intentId", args: [intent] });
  if (onChainId.toLowerCase() !== intentId.toLowerCase()) errors.push("intentId mismatch between solver and escrow (domain?)");
  const intentOk = await ctx.sep.verifyTypedData({
    address: intent.user,
    domain: ferryEscrowDomain(escrow),
    types: migrationIntentTypes,
    primaryType: "MigrationIntent",
    message: intent,
    signature: sub.intentSignature,
  });
  if (!intentOk) errors.push("intent signature is not from the user");
  const escrowNonce = await ctx.sep.readContract({ address: escrow, abi: ferryEscrowAbi, functionName: "nonces", args: [intent.user] });
  if (escrowNonce !== intent.nonce) errors.push(`intent nonce ${intent.nonce} != escrow nonce ${escrowNonce}`);

  const mNonce = await mezoNonce(ctx.mz, intent.user);
  const mezoOk = await ctx.mz.verifyTypedData({
    address: intent.user,
    domain: openTroveDomain,
    types: openTroveTypes,
    primaryType: "OpenTrove",
    message: {
      assetAmount: intent.mezoCollateral,
      debtAmount: intent.mezoDebtAmount,
      borrower: intent.user,
      recipient: ferryMezo,
      nonce: mNonce,
      deadline: sub.mezoDeadline,
    },
    signature: sub.mezoSignature,
  });
  if (!mezoOk) errors.push("Mezo OpenTrove signature does not match the intent (amounts, recipient = FerryMezo, nonce, deadline)");

  // --- Aave position
  const pos = await readAavePosition(ctx.sep, intent.user, intent.debtAsset);
  const permitDigestOk = await ctx.sep.verifyTypedData({
    address: intent.user,
    domain: aTokenPermitDomain(pos.aToken, pos.aTokenName),
    types: permitTypes,
    primaryType: "Permit",
    message: {
      owner: intent.user,
      spender: escrow,
      value: sub.permit.value,
      nonce: await ctx.sep.readContract({ address: pos.aToken, abi: abi.erc20Abi, functionName: "nonces", args: [intent.user] }),
      deadline: sub.permit.deadline,
    },
    signature: { r: sub.permit.r, s: sub.permit.s, v: BigInt(sub.permit.v) },
  });
  if (!permitDigestOk) errors.push("aToken permit signature invalid");
  if (sub.permit.value < pos.collateralAmount) errors.push("permit value is below the current aToken balance");
  if (pos.debtAmount === 0n) errors.push("user has no variable debt in the debt asset");
  if (pos.debtAmount > intent.maxDebtRepay) errors.push(`Aave debt ${formatUnits(pos.debtAmount, pos.debtDecimals)} exceeds maxDebtRepay`);
  if (pos.collateralAmount < intent.collateralAmount) errors.push("aToken balance below intent.collateralAmount");
  const debtTokenValueBase = (pos.debtAmount * 10n ** 8n) / 10n ** BigInt(pos.debtDecimals); // stablecoin ≈ $1, 8-dec base
  if (pos.totalDebtBase > (debtTokenValueBase * 101n) / 100n + 10n ** 8n)
    errors.push("user has other debt on Aave; Ferry v1 migrates positions with a single stablecoin debt");

  // --- Mezo state
  const params = await readMezoParams(ctx.mz);
  if (params.recoveryMode) errors.push("Mezo is in Recovery Mode");
  const status = await troveStatus(ctx.mz, intent.user);
  if (status === "active") errors.push("user already has an active Mezo trove (one trove per address)");
  const troveDebt = expectedTroveDebt(intent.mezoDebtAmount, params);
  const icr = (intent.mezoCollateral * params.btcPrice) / troveDebt;
  if (icr < MIN_ICR) errors.push(`resulting ICR ${pct(icr)} < 120%`);
  if (troveDebt - params.gasCompensation < params.minNetDebt) errors.push("Mezo net debt below 1,800 MUSD minimum");
  if (intent.mezoCollateral > intent.collateralAmount * 10n ** 10n) errors.push("intent asks for more BTC on Mezo than the WBTC moved");

  // --- solver economics
  const repayWad = intent.maxDebtRepay * 10n ** BigInt(18 - pos.debtDecimals);
  if (intent.solverFeeBps < policy.minFeeBps) errors.push(`solver fee ${intent.solverFeeBps} bps below policy ${policy.minFeeBps}`);
  if (intent.mezoDebtAmount * BPS < repayWad * (BPS + intent.solverFeeBps))
    errors.push("mezoDebtAmount does not cover the repaid debt plus the solver fee");

  // --- inventory
  const solverBtc = await ctx.mz.getBalance({ address: ctx.mzW.account.address, blockTag: "latest" });
  if (solverBtc < intent.mezoCollateral + policy.mezoGasReserve)
    errors.push(`solver BTC inventory ${formatEther(solverBtc)} < ${formatEther(intent.mezoCollateral)} needed`);
  const solverDebtAsset = await ctx.sep.readContract({ address: intent.debtAsset, abi: abi.erc20Abi, functionName: "balanceOf", args: [ctx.sepW.account.address] });
  // Testnet: the executor tops up from Aave's permissionless faucet right before the eth leg.
  if (solverDebtAsset < intent.maxDebtRepay && process.env.FERRY_AUTO_FAUCET === "false")
    errors.push("solver stablecoin inventory too low");
  if (![sepolia.usdc, sepolia.usdt].map((a) => a.toLowerCase()).includes(intent.debtAsset.toLowerCase()))
    errors.push("debt asset must be Aave Sepolia USDC or USDT");
  if (intent.collateralAsset.toLowerCase() !== sepolia.wbtc.toLowerCase()) errors.push("collateral asset must be Aave Sepolia WBTC");

  if (errors.length) throw new ValidationError(errors);

  // --- simulate the Mezo leg (eth_call) — the eth leg is simulated right before sending (needs allowance)
  const { upperHint, lowerHint } = await computeHints(ctx.mz, intent.mezoCollateral, troveDebt);
  const fee = await ctx.mz.readContract({ address: mezo.wormholeCore, abi: abi.wormholeAbi, functionName: "messageFee" });
  try {
    await ctx.mz.simulateContract({
      account: ctx.mzW.account,
      address: ferryMezo,
      abi: ferryMezoAbi,
      functionName: "executeMezoLeg",
      args: [{ intentId, user: intent.user, mezoCollateral: intent.mezoCollateral, mezoDebtAmount: intent.mezoDebtAmount, upperHint, lowerHint, mezoSignature: sub.mezoSignature, deadline: sub.mezoDeadline }],
      value: intent.mezoCollateral + fee,
    });
  } catch (e) {
    throw new ValidationError([`Mezo leg simulation failed: ${(e as Error).message.split("\n")[0]}`]);
  }

  const quote = quoteMigration(pos, params, intent.solverFeeBps);
  return { intentId, quote };
}
