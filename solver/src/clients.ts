import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mezoTestnet, sepolia } from "@ferry/shared/chains";
import { env } from "./env.js";

export const sepoliaRpc = () => env("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com");
export const mezoRpc = () => env("MEZO_RPC_URL", "https://rpc.test.mezo.org");

const retry = { retryCount: 5, retryDelay: 500 };

export const sepoliaPublic = () => createPublicClient({ chain: sepolia, transport: http(sepoliaRpc(), retry) });
export const mezoPublic = () => createPublicClient({ chain: mezoTestnet, transport: http(mezoRpc(), retry) });

export const account = (keyVar: string) => privateKeyToAccount(env(keyVar) as Hex);

export const sepoliaWallet = (keyVar = "SOLVER_SEPOLIA_KEY") =>
  createWalletClient({ account: account(keyVar), chain: sepolia, transport: http(sepoliaRpc(), retry) });
export const mezoWallet = (keyVar = "SOLVER_MEZO_KEY") =>
  createWalletClient({ account: account(keyVar), chain: mezoTestnet, transport: http(mezoRpc(), retry) });

export type SepoliaPublic = ReturnType<typeof sepoliaPublic>;
export type MezoPublic = ReturnType<typeof mezoPublic>;
