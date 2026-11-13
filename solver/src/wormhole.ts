import { pad, toHex, type Address, type Hex } from "viem";
import { WORMHOLESCAN_API } from "@ferry/shared/addresses";

export const MEZO_WORMHOLE_CHAIN_ID = 50; // verified on chain: Mezo core chainId() (env-check)
export const SEPOLIA_WORMHOLE_CHAIN_ID = 10002;

export const vaaUrl = (emitterChain: number, emitter: Address, sequence: bigint) =>
  `${WORMHOLESCAN_API}/vaas/${emitterChain}/${pad(emitter).slice(2).toLowerCase()}/${sequence}`;

export const wormholescanLink = (emitterChain: number, emitter: Address, sequence: bigint) =>
  `https://wormholescan.io/#/tx/${emitterChain}/${pad(emitter).slice(2).toLowerCase()}/${sequence}?network=Testnet`;

/** Polls the Wormholescan testnet API until the guardians have signed the VAA. */
export async function fetchSignedVaa(
  emitterChain: number,
  emitter: Address,
  sequence: bigint,
  { timeoutMs = 30 * 60_000, intervalMs = 10_000, log = (_: string) => {} } = {},
): Promise<Hex> {
  const url = vaaUrl(emitterChain, emitter, sequence);
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    attempt++;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = (await res.json()) as { data?: { vaa?: string } };
        if (body.data?.vaa) return toHex(Buffer.from(body.data.vaa, "base64"));
      }
      log(`VAA not ready yet (attempt ${attempt}, HTTP ${res.status})`);
    } catch (e) {
      log(`Wormholescan error (attempt ${attempt}): ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for VAA ${url}`);
}
