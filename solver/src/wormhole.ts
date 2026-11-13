import { pad, toHex, type Address, type Hex } from "viem";
import { WORMHOLESCAN_API } from "@ferry/shared/addresses";

export const MEZO_WORMHOLE_CHAIN_ID = 50; // verified on chain: Mezo core chainId() (env-check)
export const SEPOLIA_WORMHOLE_CHAIN_ID = 10002;

export const vaaUrl = (emitterChain: number, emitter: Address, sequence: bigint) =>
  `${WORMHOLESCAN_API}/vaas/${emitterChain}/${pad(emitter).slice(2).toLowerCase()}/${sequence}`;

export const wormholescanLink = (emitterChain: number, emitter: Address, sequence: bigint) =>
  `https://wormholescan.io/#/tx/${emitterChain}/${pad(emitter).slice(2).toLowerCase()}/${sequence}?network=Testnet`;

export class VaaTimeout extends Error {}

async function tryFetch(url: string): Promise<{ vaa?: Hex; status: number }> {
  const res = await fetch(url);
  if (!res.ok) return { status: res.status };
  const body = (await res.json()) as { data?: { vaa?: string } };
  return { status: res.status, vaa: body.data?.vaa ? toHex(Buffer.from(body.data.vaa, "base64")) : undefined };
}

/**
 * Polls the Wormholescan testnet API until the guardians have signed a VAA for any of `sequences`
 * (the original message and any re-published copies). Throws VaaTimeout after `timeoutMs`.
 */
export async function fetchAnySignedVaa(
  emitterChain: number,
  emitter: Address,
  sequences: bigint[],
  { timeoutMs = 30 * 60_000, intervalMs = 10_000, log = (_: string) => {} } = {},
): Promise<{ vaa: Hex; sequence: bigint }> {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    attempt++;
    for (const sequence of sequences) {
      try {
        const { vaa, status } = await tryFetch(vaaUrl(emitterChain, emitter, sequence));
        if (vaa) return { vaa, sequence };
        if (attempt % 6 === 1) log(`VAA ${sequence} not signed yet (HTTP ${status})`);
      } catch (e) {
        log(`Wormholescan error: ${(e as Error).message}`);
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new VaaTimeout(`no signed VAA for sequences ${sequences.join(",")} after ${Math.round(timeoutMs / 60_000)} min`);
}

/** Single-sequence convenience wrapper. */
export async function fetchSignedVaa(
  emitterChain: number,
  emitter: Address,
  sequence: bigint,
  opts: { timeoutMs?: number; intervalMs?: number; log?: (m: string) => void } = {},
): Promise<Hex> {
  return (await fetchAnySignedVaa(emitterChain, emitter, [sequence], opts)).vaa;
}
