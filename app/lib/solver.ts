import type { Address, Hex } from "viem";
import type { IntentSubmission, Quote } from "@ferry/shared/ferry";
import deployments from "@ferry/shared/deployments.json";

export const SOLVER_URL = process.env.NEXT_PUBLIC_SOLVER_URL ?? "http://localhost:8787";

export const ferryAddresses = {
  escrow: deployments.sepolia.ferryEscrow as Address,
  ferryMezo: deployments.mezo.ferryMezo as Address,
  timeoutSeconds: deployments.sepolia.ferryEscrowTimeout,
};

export type IntentStatus =
  | "Received"
  | "Validated"
  | "EthLegDone"
  | "MezoLegDone"
  | "VaaFetched"
  | "Completed"
  | "Failed"
  | "AwaitingRefund"
  | "Refunded";

export type IntentView = {
  id: Hex;
  user: Address;
  status: IntentStatus;
  escrow: Address;
  ferryMezo: Address;
  txs: { ethLeg?: Hex; mezoLeg?: Hex; finalize?: Hex; refund?: Hex };
  wormholeSequence?: string;
  vaa?: Hex;
  error?: string;
  quote?: Quote;
  history: { status: IntentStatus; at: string; note?: string }[];
  createdAt: string;
  updatedAt: string;
};

// The solver serialises bigints as "123n"; we keep them as strings in the UI and parse where needed.
const reviver = (_: string, v: unknown) => (typeof v === "string" && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);
const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SOLVER_URL}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const text = await res.text();
  const body = text ? JSON.parse(text, reviver) : null;
  if (!res.ok) {
    const reasons: string[] = body?.reasons ?? [body?.error ?? `HTTP ${res.status}`];
    throw new Error(reasons.join("\n"));
  }
  return body as T;
}

export const solver = {
  health: () => call<{ ok: boolean; pending: number }>("/health"),
  config: () => call<{ escrow: Address; ferryMezo: Address; solver: Address; minFeeBps: bigint; timeout: number }>("/config"),
  submit: (sub: IntentSubmission) => call<IntentView>("/intents", { method: "POST", body: JSON.stringify(sub, replacer) }),
  get: (id: string) => call<IntentView>(`/intents/${id}`),
  byUser: (user: string) => call<IntentView[]>(`/intents?user=${user}`),
};
