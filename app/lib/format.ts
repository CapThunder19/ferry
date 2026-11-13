import { MEZO_EXPLORER, SEPOLIA_EXPLORER } from "@ferry/shared/addresses";
import { pad } from "viem";

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export const num = (v: bigint, decimals: number, digits = 2) =>
  (Number(v) / 10 ** decimals).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const usd = (v: number, digits = 0) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export const ratio = (wad: bigint) => `${(Number(wad) / 1e16).toFixed(1)}%`;

export const links = {
  sepTx: (h: string) => `${SEPOLIA_EXPLORER}/tx/${h}`,
  sepAddr: (a: string) => `${SEPOLIA_EXPLORER}/address/${a}`,
  mezoTx: (h: string) => `${MEZO_EXPLORER}/tx/${h}`,
  mezoAddr: (a: string) => `${MEZO_EXPLORER}/address/${a}`,
  vaa: (emitter: string, seq: string) =>
    `https://wormholescan.io/#/tx/50/${pad(emitter as `0x${string}`).slice(2).toLowerCase()}/${seq}?network=Testnet`,
};
