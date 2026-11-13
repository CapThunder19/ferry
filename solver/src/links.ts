import { MEZO_EXPLORER, SEPOLIA_EXPLORER } from "@ferry/shared/addresses";

export const sepTx = (h: string) => `${SEPOLIA_EXPLORER}/tx/${h}`;
export const sepAddr = (a: string) => `${SEPOLIA_EXPLORER}/address/${a}`;
export const mezoTx = (h: string) => `${MEZO_EXPLORER}/tx/${h}`;
export const mezoAddr = (a: string) => `${MEZO_EXPLORER}/address/${a}`;

export const step = (title: string) => console.log(`\n=== ${title}`);
