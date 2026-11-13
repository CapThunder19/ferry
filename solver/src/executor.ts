// Restart-safe state machine: Received → Validated → EthLegDone → MezoLegDone → VaaFetched → Completed
// (or Failed / AwaitingRefund → Refunded). Every step first checks chain state, so re-running is idempotent.
// Intents progress in parallel; the solver's own transactions are serialised per chain (nonce safety).
import type { Hex } from "viem";
import { ferryEscrowAbi, ferryMezoAbi } from "@ferry/shared/ferryArtifacts";
import type { Ctx } from "./legs.js";
import { ensureSolverAllowance, ensureSolverDebtAsset, sendEthLeg, sendFinalize, sendMezoLeg, sendRefund, sendRepublish } from "./legs.js";
import { IntentStore, TERMINAL, type IntentRecord } from "./store.js";
import { ValidationError, validateSubmission } from "./validate.js";
import { MEZO_WORMHOLE_CHAIN_ID, VaaTimeout, fetchAnySignedVaa } from "./wormhole.js";
import { Mutex } from "./mutex.js";
import { optionalEnv } from "./env.js";

const ESCROW_STATUS = ["None", "Pending", "Completed", "Refunded"] as const;
const MAX_ATTEMPTS = 5;
/** Republish the proof if no guardian signature arrived within this window. */
const REPUBLISH_AFTER_MS = Number(optionalEnv("FERRY_REPUBLISH_AFTER_MINUTES") ?? 10) * 60_000;
const MAX_REPUBLISHES = Number(optionalEnv("FERRY_MAX_REPUBLISHES") ?? 3);

export class Executor {
  private running = new Set<string>();
  private sepoliaTx = new Mutex();
  private mezoTx = new Mutex();

  constructor(
    private ctx: Ctx,
    private store: IntentStore,
    private log = (id: string, m: string) => console.log(`[${new Date().toISOString()}] ${id.slice(0, 10)} ${m}`),
  ) {}

  /** Resume every non-terminal intent (called at boot and periodically). */
  resumeAll() {
    for (const r of this.store.pending()) this.kick(r.id);
  }

  kick(id: string) {
    if (this.running.has(id)) return;
    this.running.add(id);
    this.run(id)
      .catch((e) => this.log(id, `unexpected: ${(e as Error).message}`))
      .finally(() => this.running.delete(id));
  }

  private async run(id: string) {
    for (;;) {
      const r = this.store.get(id);
      if (!r || TERMINAL.includes(r.status)) return;
      try {
        const progressed = await this.step(r);
        if (!progressed) return; // waiting (e.g. refund timeout); a later tick resumes it
      } catch (e) {
        const msg = e instanceof ValidationError ? e.message : (e as Error).message.split("\n")[0];
        const attempts = r.attempts + 1;
        this.log(id, `step ${r.status} failed (${attempts}/${MAX_ATTEMPTS}): ${msg}`);
        if (e instanceof ValidationError || attempts >= MAX_ATTEMPTS) {
          // Funds committed on Sepolia but no Mezo leg → wait for the escrow timeout and refund.
          const next =
            r.status === "EthLegDone" ? "AwaitingRefund" : r.status === "Received" || r.status === "Validated" ? "Failed" : r.status;
          this.store.update(id, { status: next, error: msg, attempts: next === r.status ? 0 : attempts }, msg);
          if (next === r.status) return; // MezoLegDone / VaaFetched: retried on the next periodic tick
        } else {
          this.store.update(id, { attempts, error: msg });
          await new Promise((res) => setTimeout(res, 3_000 * attempts));
        }
      }
    }
  }

  /** Performs one transition. Returns false when there is nothing to do yet. */
  private async step(r: IntentRecord): Promise<boolean> {
    const { ctx } = this;
    const escrowState = async () =>
      ESCROW_STATUS[(await ctx.sep.readContract({ address: r.escrow, abi: ferryEscrowAbi, functionName: "getEscrow", args: [r.id] })).status];

    switch (r.status) {
      case "Received": {
        const { quote } = await validateSubmission(ctx, r.escrow, r.ferryMezo, r.submission);
        this.store.update(r.id, { status: "Validated", quote, attempts: 0, error: undefined });
        this.log(r.id, "validated");
        return true;
      }
      case "Validated": {
        if ((await escrowState()) === "None") {
          const { debtAsset, maxDebtRepay } = r.submission.intent;
          const res = await this.sepoliaTx.run(async () => {
            await ensureSolverDebtAsset(ctx, debtAsset, maxDebtRepay);
            await ensureSolverAllowance(ctx, r.escrow, debtAsset, maxDebtRepay);
            return sendEthLeg(ctx, r.escrow, r.submission);
          });
          this.store.update(r.id, { txs: { ...r.txs, ethLeg: res.hash } });
          this.log(r.id, `eth leg ${res.hash}`);
        }
        this.store.update(r.id, { status: "EthLegDone", attempts: 0, error: undefined });
        return true;
      }
      case "EthLegDone": {
        const executed = await ctx.mz.readContract({ address: r.ferryMezo, abi: ferryMezoAbi, functionName: "executed", args: [r.id], blockTag: "latest" });
        let sequence: bigint;
        let hash: Hex | undefined;
        if (executed) {
          ({ sequence, hash } = await this.findMezoLeg(r));
        } else {
          ({ sequence, hash } = await this.mezoTx.run(() => sendMezoLeg(ctx, r.ferryMezo, r.id as Hex, r.submission)));
        }
        this.store.update(r.id, {
          status: "MezoLegDone",
          wormholeSequence: sequence.toString(),
          wormholeSequences: [sequence.toString()],
          txs: { ...this.store.get(r.id)!.txs, mezoLeg: hash },
          attempts: 0,
          error: undefined,
        });
        this.log(r.id, `mezo leg ${hash}, wormhole sequence ${sequence}`);
        return true;
      }
      case "MezoLegDone": {
        const sequences = (r.wormholeSequences ?? [r.wormholeSequence!]).map(BigInt);
        try {
          const { vaa, sequence } = await fetchAnySignedVaa(MEZO_WORMHOLE_CHAIN_ID, r.ferryMezo, sequences, {
            timeoutMs: REPUBLISH_AFTER_MS,
            log: (m) => this.log(r.id, m),
          });
          this.store.update(r.id, { status: "VaaFetched", vaa, wormholeSequence: sequence.toString(), attempts: 0, error: undefined });
          return true;
        } catch (e) {
          if (!(e instanceof VaaTimeout)) throw e;
          const done = r.republishes?.length ?? 0;
          if (done >= MAX_REPUBLISHES) {
            this.store.update(r.id, { error: "waiting for Wormhole guardians (republish limit reached)" });
            return false; // keep polling on later ticks; the escrow timeout protects everyone
          }
          // Guardians did not sign in time — re-emit the stored proof (FerryMezo v2).
          try {
            const rep = await this.mezoTx.run(() => sendRepublish(ctx, r.ferryMezo, r.id as Hex));
            const seq = rep.sequence.toString();
            this.store.update(r.id, {
              wormholeSequence: seq,
              wormholeSequences: [...sequences.map(String), seq],
              republishes: [...(r.republishes ?? []), { hash: rep.hash, sequence: seq, at: new Date().toISOString() }],
              error: `no guardian signature after ${REPUBLISH_AFTER_MS / 60_000} min — republished as sequence ${seq}`,
            });
            this.log(r.id, `republished proof: ${rep.hash}, sequence ${seq}`);
          } catch (err) {
            this.log(r.id, `republish unavailable: ${(err as Error).message.split("\n")[0]}`);
            this.store.update(r.id, { republishes: [...(r.republishes ?? []), { hash: "0x", sequence: "-", at: new Date().toISOString() }] });
          }
          return true;
        }
      }
      case "VaaFetched": {
        if ((await escrowState()) === "Pending") {
          const res = await this.sepoliaTx.run(() => sendFinalize(ctx, r.escrow, r.vaa!));
          this.store.update(r.id, { txs: { ...r.txs, finalize: res.hash } });
          this.log(r.id, `finalized ${res.hash}`);
        }
        this.store.update(r.id, { status: "Completed", attempts: 0, error: undefined });
        return true;
      }
      case "AwaitingRefund": {
        const state = await escrowState();
        if (state === "Pending") {
          const at = await ctx.sep.readContract({ address: r.escrow, abi: ferryEscrowAbi, functionName: "refundableAt", args: [r.id] });
          if (BigInt(Math.floor(Date.now() / 1000)) < at) return false;
          const res = await this.sepoliaTx.run(() => sendRefund(ctx, r.escrow, r.id as Hex));
          this.store.update(r.id, { txs: { ...r.txs, refund: res.hash } });
        }
        this.store.update(r.id, { status: state === "Completed" ? "Completed" : "Refunded", attempts: 0 });
        return true;
      }
      default:
        return false;
    }
  }

  /** Recovers the Wormhole sequence of an already-executed Mezo leg from its event (restart safety). */
  private async findMezoLeg(r: IntentRecord) {
    const head = await this.ctx.mz.getBlockNumber();
    const logs = await this.ctx.mz.getContractEvents({
      address: r.ferryMezo,
      abi: ferryMezoAbi,
      eventName: "MezoLegExecuted",
      args: { intentId: r.id as Hex },
      fromBlock: head > 50_000n ? head - 50_000n : 0n,
      toBlock: head,
    });
    if (!logs.length) throw new Error("Mezo leg executed but event not found in the last 50k blocks");
    return { sequence: logs[0].args.sequence!, hash: logs[0].transactionHash };
  }
}
