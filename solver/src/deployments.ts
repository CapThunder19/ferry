import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Address } from "viem";

/** Ferry deployments are stored in shared/deployments.json so the solver and app read the same addresses. */
export type Deployments = {
  mezo?: { ferryMezo?: Address; deployedAt?: string; tx?: string };
  sepolia?: {
    ferryEscrow?: Address;
    ferryEscrowTimeout?: number;
    ferryEscrowShort?: Address; // short timeout, used to demonstrate the refund path
    ferryEscrowShortTimeout?: number;
    vaaVerifier?: Address;
    deployedAt?: string;
  };
};

const here = dirname(fileURLToPath(import.meta.url));
export const DEPLOYMENTS_PATH = resolve(here, "../../shared/deployments.json");

export function loadDeployments(): Deployments {
  return existsSync(DEPLOYMENTS_PATH) ? JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8")) : {};
}

export function saveDeployments(d: Deployments) {
  writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(d, null, 2) + "\n");
}

export function requireDeployment<T>(value: T | undefined, what: string): T {
  if (!value) throw new Error(`${what} not deployed yet — run \`npm run deploy -w solver\` first`);
  return value;
}
