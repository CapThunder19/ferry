// Persistent intent store: a JSON file in solver/data (git-ignored). Writes are atomic (tmp file + rename).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Address, Hex } from "viem";
import type { IntentSubmission, Quote } from "@ferry/shared/ferry";

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

export const TERMINAL: IntentStatus[] = ["Completed", "Failed", "Refunded"];

export type IntentRecord = {
  id: Hex; // EIP-712 intentId (FerryEscrow domain)
  user: Address;
  status: IntentStatus;
  submission: IntentSubmission;
  quote?: Quote;
  escrow: Address;
  ferryMezo: Address;
  txs: { ethLeg?: Hex; mezoLeg?: Hex; finalize?: Hex; refund?: Hex };
  wormholeSequence?: string;
  vaa?: Hex;
  error?: string;
  attempts: number;
  history: { status: IntentStatus; at: string; note?: string }[];
  createdAt: string;
  updatedAt: string;
};

const here = dirname(fileURLToPath(import.meta.url));
const FILE = process.env.FERRY_STORE_FILE ?? resolve(here, "../data/intents.json");

// bigint-safe JSON
const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? `${v}n` : v);
const reviver = (_: string, v: unknown) => (typeof v === "string" && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);
export const toJson = (v: unknown, space?: number) => JSON.stringify(v, replacer, space);
export const fromJson = <T>(s: string): T => JSON.parse(s, reviver);

export class IntentStore {
  private intents = new Map<string, IntentRecord>();

  constructor(private file = FILE) {
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) for (const r of fromJson<IntentRecord[]>(readFileSync(file, "utf8"))) this.intents.set(r.id.toLowerCase(), r);
  }

  get(id: string) {
    return this.intents.get(id.toLowerCase());
  }

  all() {
    return [...this.intents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  byUser(user: string) {
    return this.all().filter((r) => r.user.toLowerCase() === user.toLowerCase());
  }

  pending() {
    return this.all().filter((r) => !TERMINAL.includes(r.status));
  }

  insert(r: IntentRecord) {
    this.intents.set(r.id.toLowerCase(), r);
    this.flush();
  }

  update(id: string, patch: Partial<IntentRecord>, note?: string) {
    const r = this.get(id);
    if (!r) throw new Error(`unknown intent ${id}`);
    const now = new Date().toISOString();
    if (patch.status && patch.status !== r.status) r.history.push({ status: patch.status, at: now, note });
    Object.assign(r, patch, { updatedAt: now });
    this.flush();
    return r;
  }

  private flush() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, toJson(this.all(), 2));
    renameSync(tmp, this.file);
  }
}
