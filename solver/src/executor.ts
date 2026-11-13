// Restart-safe state machine: Received → Validated → EthLegDone → MezoLegDone → VaaFetched → Completed
// (or Failed / AwaitingRefund → Refunded). Every step first checks chain state, so re-running is idempotent.
import type { Hex } from "viem";
import { ferryEscrowAbi, ferryMezoAbi } from "@ferry/shared/ferryArtifacts";
import type { Ctx } from "./legs.js";
import { ensureSolverAllowance, sendEthLeg, sendFinalize, sendMezoLeg, sendRefund } from "./legs.js";
import { IntentStore, TERMINAL, type IntentRecord } from "./store.js";
import { ValidationError, validateSubmission } from "./validate.js";
import { MEZO_WORMHOLE_CHAIN_ID, fetchSignedVaa } from "./wormhole.js";

const ESCROW_STATUS = ["None", "Pending", "Completed", "Refunded"] as const;
const MAX_ATTEMPTS = 5;

export class Executor {
  private running = new Set<string>();
  /** Serialises transactions per chain so the solver never races its own nonces. */
  private queue: Promise<unknown> = Promise.resolve();

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
    this.queue = this.queue
      .then(() => this.run(id))
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
          const next = r.status === "EthLegDone" ? "AwaitingRefund" : r.status === "Received" || r.status === "Validated" ? "Failed" : r.status;
          this.store.update(id, { status: next, error: msg, attempts }, msg);
          if (next === r.status) return; // MezoLegDone / VaaFetched: keep retrying on later ticks
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
          await ensureSolverAllowance(ctx, r.escrow, r.submission.intent.debtAsset, r.submission.intent.maxDebtRepay);
          const res = await sendEthLeg(ctx, r.escrow, r.submission);
          this.store.update(r.id, { txs: { ...r.txs, ethLeg: res.hash } });
          this.log(r.id, `eth leg ${res.hash}`);
        }
        this.store.update(r.id, { status: "EthLegDone", attempts: 0, error: undefined });
        return true;
      }
      case "EthLegDone": {
        const executed = await ctx.mz.readContract({ address: r.ferryMezo, abi: ferryMezoAbi, functionName: "executed", args: [r.id], blockTag: "latest" });
        let sequence: bigint;
        let hash: Hex | undefined = r.txs.mezoLeg;
        if (executed) {
          ({ sequence, hash } = await this.findMezoLeg(r));
        } else {
          const res = await sendMezoLeg(ctx, r.ferryMezo, r.id as Hex, r.submission);
          ({ sequence, hash } = res);
        }
        this.store.update(r.id, { status: "MezoLegDone", wormholeSequence: sequence.toString(), txs: { ...r.txs, mezoLeg: hash }, attempts: 0, error: undefined });
        this.log(r.id, `mezo leg ${hash}, wormhole sequence ${sequence}`);
        return true;
      }
      case "MezoLegDone": {
        const vaa = await fetchSignedVaa(MEZO_WORMHOLE_CHAIN_ID, r.ferryMezo, BigInt(r.wormholeSequence!), { log: (m) => this.log(r.id, m) });
        this.store.update(r.id, { status: "VaaFetched", vaa, attempts: 0, error: undefined });
        return true;
      }
      case "VaaFetched": {
        if ((await escrowState()) === "Pending") {
          const res = await sendFinalize(ctx, r.escrow, r.vaa!);
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
          const res = await sendRefund(ctx, r.escrow, r.id as Hex);
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
