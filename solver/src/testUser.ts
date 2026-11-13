// User-side actions for the milestone scripts (in the product, the browser wallet does these).
import { createWalletClient, http, parseEther, type Address, type Hex, type LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sepolia as sepoliaChain } from "@ferry/shared/chains";
import { mezo, sepolia } from "@ferry/shared/addresses";
import * as abi from "@ferry/shared/abis";
import { ferryEscrowAbi } from "@ferry/shared/ferryArtifacts";
import {
  aTokenPermitDomain,
  ferryEscrowDomain,
  migrationIntentTypes,
  openTroveDomain,
  openTroveTypes,
  permitTypes,
  quoteMigration,
  type IntentSubmission,
  type MigrationIntent,
  type Quote,
} from "@ferry/shared/ferry";
import { parseSignature } from "viem";
import { sepoliaRpc } from "./clients.js";
import { readAavePosition } from "./aave.js";
import { mezoNonce, readMezoParams } from "./mezo.js";
import type { Ctx } from "./legs.js";

const here = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = resolve(here, "../data/test-users.json");

/** Fresh throwaway user per run (one Mezo trove per address). Keys saved to solver/data (git-ignored). */
export function newTestUser(label: string): LocalAccount {
  const pk = generatePrivateKey();
  mkdirSync(dirname(USERS_FILE), { recursive: true });
  const all = existsSync(USERS_FILE) ? JSON.parse(readFileSync(USERS_FILE, "utf8")) : [];
  const account = privateKeyToAccount(pk);
  all.push({ label, address: account.address, pk, createdAt: new Date().toISOString() });
  writeFileSync(USERS_FILE, JSON.stringify(all, null, 2));
  return account;
}

export function loadTestUser(address: Address): LocalAccount {
  const all = JSON.parse(readFileSync(USERS_FILE, "utf8")) as { address: Address; pk: Hex }[];
  const u = all.find((x) => x.address.toLowerCase() === address.toLowerCase());
  if (!u) throw new Error(`unknown test user ${address}`);
  return privateKeyToAccount(u.pk);
}

const userWallet = (account: LocalAccount) => createWalletClient({ account, chain: sepoliaChain, transport: http(sepoliaRpc()) });

/** Gives the user gas, mints WBTC from Aave's faucet, supplies it and borrows USDC: a real Aave position. */
export async function createAavePosition(ctx: Ctx, user: LocalAccount, wbtcAmount: bigint, usdcBorrow: bigint, log = console.log) {
  const txs: Record<string, Hex> = {};
  const gas = parseEther("0.01");
  if ((await ctx.sep.getBalance({ address: user.address })) < gas / 2n) {
    txs.fundGas = await ctx.sepW.sendTransaction({ to: user.address, value: gas });
    await ctx.sep.waitForTransactionReceipt({ hash: txs.fundGas });
    log(`  funded user with 0.01 ETH: ${txs.fundGas}`);
  }
  txs.faucetWbtc = await ctx.sepW.writeContract({ address: sepolia.aaveFaucet, abi: abi.aaveFaucetAbi, functionName: "mint", args: [sepolia.wbtc, user.address, wbtcAmount] });
  await ctx.sep.waitForTransactionReceipt({ hash: txs.faucetWbtc });

  const w = userWallet(user);
  txs.approve = await w.writeContract({ address: sepolia.wbtc, abi: abi.erc20Abi, functionName: "approve", args: [sepolia.aavePool, wbtcAmount] });
  await ctx.sep.waitForTransactionReceipt({ hash: txs.approve });
  txs.supply = await w.writeContract({ address: sepolia.aavePool, abi: abi.aavePoolAbi, functionName: "supply", args: [sepolia.wbtc, wbtcAmount, user.address, 0] });
  await ctx.sep.waitForTransactionReceipt({ hash: txs.supply });
  txs.borrow = await w.writeContract({ address: sepolia.aavePool, abi: abi.aavePoolAbi, functionName: "borrow", args: [sepolia.usdc, usdcBorrow, 2n, 0, user.address] });
  const r = await ctx.sep.waitForTransactionReceipt({ hash: txs.borrow });
  if (r.status !== "success") throw new Error("borrow failed");
  return txs;
}

/** Makes sure the solver holds enough Aave test USDC (permissionless faucet). */
export async function ensureSolverUsdc(ctx: Ctx, needed: bigint) {
  const bal = await ctx.sep.readContract({ address: sepolia.usdc, abi: abi.erc20Abi, functionName: "balanceOf", args: [ctx.sepW.account.address] });
  if (bal >= needed) return undefined;
  const hash = await ctx.sepW.writeContract({ address: sepolia.aaveFaucet, abi: abi.aaveFaucetAbi, functionName: "mint", args: [sepolia.usdc, ctx.sepW.account.address, 10_000n * 10n ** 6n] });
  await ctx.sep.waitForTransactionReceipt({ hash });
  return hash;
}

/** Quotes from live data and produces the three signatures the frontend would collect. */
export async function signMigration(
  ctx: Ctx,
  user: LocalAccount,
  escrow: Address,
  ferryMezo: Address,
): Promise<{ submission: IntentSubmission; quote: Quote }> {
  const [pos, params] = await Promise.all([readAavePosition(ctx.sep, user.address), readMezoParams(ctx.mz)]);
  const quote = quoteMigration(pos, params);
  if (quote.errors.length) throw new Error(`quote rejected: ${quote.errors.join("; ")}`);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const nonce = await ctx.sep.readContract({ address: escrow, abi: ferryEscrowAbi, functionName: "nonces", args: [user.address] });
  const intent: MigrationIntent = {
    user: user.address,
    collateralAsset: sepolia.wbtc,
    collateralAmount: quote.collateralAmount,
    debtAsset: sepolia.usdc,
    maxDebtRepay: quote.maxDebtRepay,
    mezoCollateral: quote.mezoCollateral,
    mezoDebtAmount: quote.mezoDebtAmount,
    solverFeeBps: quote.solverFeeBps,
    nonce,
    deadline: now + 3600n,
  };
  const intentSignature = await user.signTypedData({ domain: ferryEscrowDomain(escrow), types: migrationIntentTypes, primaryType: "MigrationIntent", message: intent });

  const permitValue = (quote.collateralAmount * 101n) / 100n + 1n; // headroom for aToken interest
  const permitDeadline = now + 3600n;
  const aNonce = await ctx.sep.readContract({ address: pos.aToken, abi: abi.erc20Abi, functionName: "nonces", args: [user.address] });
  const permitSig = await user.signTypedData({
    domain: aTokenPermitDomain(pos.aToken, pos.aTokenName),
    types: permitTypes,
    primaryType: "Permit",
    message: { owner: user.address, spender: escrow, value: permitValue, nonce: aNonce, deadline: permitDeadline },
  });
  const { v, r, s, yParity } = parseSignature(permitSig);

  const mezoDeadline = now + 2n * 3600n;
  const mNonce = await mezoNonce(ctx.mz, user.address);
  const mezoSignature = await user.signTypedData({
    domain: openTroveDomain,
    types: openTroveTypes,
    primaryType: "OpenTrove",
    message: {
      assetAmount: intent.mezoCollateral,
      debtAmount: intent.mezoDebtAmount,
      borrower: user.address,
      recipient: ferryMezo,
      nonce: mNonce,
      deadline: mezoDeadline,
    },
  });

  return {
    quote,
    submission: {
      intent,
      intentSignature,
      permit: { value: permitValue, deadline: permitDeadline, v: Number(v ?? BigInt(yParity + 27)), r, s },
      mezoSignature,
      mezoDeadline,
    },
  };
}

export { mezo };
