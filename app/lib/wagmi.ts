import { createConfig, http, injected } from "wagmi";
import { createPublicClient } from "viem";
import { mezoTestnet, sepolia } from "@ferry/shared/chains";

export const SEPOLIA_RPC = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
export const MEZO_RPC = process.env.NEXT_PUBLIC_MEZO_RPC_URL ?? "https://rpc.test.mezo.org";

export const config = createConfig({
  chains: [sepolia, mezoTestnet],
  connectors: [injected()],
  transports: { [sepolia.id]: http(SEPOLIA_RPC), [mezoTestnet.id]: http(MEZO_RPC) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

/** Read-only clients (no wallet needed) for live on-chain data. */
export const sepoliaClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC, { retryCount: 4 }) });
export const mezoClient = createPublicClient({ chain: mezoTestnet, transport: http(MEZO_RPC, { retryCount: 4 }) });

export { mezoTestnet, sepolia };
