// Ferry solver HTTP API (M5).
//   GET  /health
//   GET  /config                 deployed addresses + solver policy
//   GET  /quote?user=0x…         live Aave position + Mezo params → migration quote
//   POST /intents                IntentSubmission (bigints as decimal strings) → { id, status }
//   GET  /intents/:id            status, tx hashes, VAA, timestamps
//   GET  /intents?user=0x…       a user's intents
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { quoteMigration, type IntentSubmission } from "@ferry/shared/ferry";
import { makeCtx } from "./legs.js";
import { IntentStore, toJson } from "./store.js";
import { Executor } from "./executor.js";
import { loadDeployments, requireDeployment } from "./deployments.js";
import { validateSubmission, ValidationError, DEFAULT_POLICY } from "./validate.js";
import { readAavePosition } from "./aave.js";
import { detectDebtAsset } from "@ferry/shared/readers";
import { readMezoParams, troveStatus } from "./mezo.js";
import { optionalEnv } from "./env.js";
import { startKeepAlive } from "./keepalive.js";

const PORT = Number(optionalEnv("PORT") ?? optionalEnv("SOLVER_PORT") ?? 8787); // PORT: set by Railway/Render
const ctx = makeCtx();
const store = new IntentStore();
const executor = new Executor(ctx, store);
const d = loadDeployments();
const escrow = getAddress(requireDeployment(d.sepolia?.ferryEscrow, "FerryEscrow"));
const ferryMezo = getAddress(requireDeployment(d.mezo?.ferryMezo, "FerryMezo"));

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(toJson(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error("body too large");
  }
  return JSON.parse(raw);
}

const big = (v: unknown, name: string) => {
  if (typeof v !== "string" && typeof v !== "number") throw new ValidationError([`${name} must be a decimal string`]);
  return BigInt(v);
};
const addr = (v: unknown, name: string) => {
  if (typeof v !== "string" || !isAddress(v)) throw new ValidationError([`${name} must be an address`]);
  return getAddress(v);
};
const hex = (v: unknown, name: string) => {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]*$/.test(v)) throw new ValidationError([`${name} must be hex`]);
  return v as Hex;
};

/** Parses the JSON body into typed bigints/addresses. */
function parseSubmission(b: any): IntentSubmission {
  const i = b?.intent ?? {};
  return {
    intent: {
      user: addr(i.user, "intent.user"),
      collateralAsset: addr(i.collateralAsset, "intent.collateralAsset"),
      collateralAmount: big(i.collateralAmount, "intent.collateralAmount"),
      debtAsset: addr(i.debtAsset, "intent.debtAsset"),
      maxDebtRepay: big(i.maxDebtRepay, "intent.maxDebtRepay"),
      mezoCollateral: big(i.mezoCollateral, "intent.mezoCollateral"),
      mezoDebtAmount: big(i.mezoDebtAmount, "intent.mezoDebtAmount"),
      solverFeeBps: big(i.solverFeeBps, "intent.solverFeeBps"),
      nonce: big(i.nonce, "intent.nonce"),
      deadline: big(i.deadline, "intent.deadline"),
    },
    intentSignature: hex(b.intentSignature, "intentSignature"),
    permit: {
      value: big(b.permit?.value, "permit.value"),
      deadline: big(b.permit?.deadline, "permit.deadline"),
      v: Number(b.permit?.v),
      r: hex(b.permit?.r, "permit.r"),
      s: hex(b.permit?.s, "permit.s"),
    },
    mezoSignature: hex(b.mezoSignature, "mezoSignature"),
    mezoDeadline: big(b.mezoDeadline, "mezoDeadline"),
  };
}

/** Public view of a record: bigints as strings, no internal fields. */
const view = (r: NonNullable<ReturnType<typeof store.get>>) => ({
  id: r.id,
  user: r.user,
  status: r.status,
  escrow: r.escrow,
  ferryMezo: r.ferryMezo,
  txs: r.txs,
  wormholeSequence: r.wormholeSequence,
  wormholeSequences: r.wormholeSequences,
  republishes: r.republishes,
  vaa: r.vaa,
  error: r.error,
  quote: r.quote,
  intent: r.submission.intent,
  history: r.history,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "OPTIONS") return send(res, 204, null);

    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, pending: store.pending().length });

    if (req.method === "GET" && url.pathname === "/config")
      return send(res, 200, { escrow, ferryMezo, solver: ctx.sepW.account.address, minFeeBps: DEFAULT_POLICY.minFeeBps, timeout: d.sepolia?.ferryEscrowTimeout });

    if (req.method === "GET" && url.pathname === "/quote") {
      const user = addr(url.searchParams.get("user"), "user");
      const debt = await detectDebtAsset(ctx.sep, user);
      const [pos, params, trove] = await Promise.all([readAavePosition(ctx.sep, user, debt.asset), readMezoParams(ctx.mz), troveStatus(ctx.mz, user)]);
      const quote = quoteMigration(pos, params, DEFAULT_POLICY.minFeeBps);
      if (trove === "active") quote.errors.push("You already have an active Mezo trove (one per address). Use a different address.");
      if (debt.multiple) quote.errors.push("You owe both USDC and USDT on Aave; Ferry v1 migrates a single-stablecoin loan.");
      return send(res, 200, { position: pos, debtAsset: debt.asset, debtSymbol: debt.symbol, mezo: params, quote, existingTrove: trove });
    }

    if (req.method === "POST" && url.pathname === "/intents") {
      const sub = parseSubmission(await readBody(req));
      const { intentId, quote } = await validateSubmission(ctx, escrow, ferryMezo, sub);
      const existing = store.get(intentId);
      if (existing) return send(res, 200, view(existing));
      const now = new Date().toISOString();
      store.insert({
        id: intentId,
        user: sub.intent.user as Address,
        status: "Validated",
        submission: sub,
        quote,
        escrow,
        ferryMezo,
        txs: {},
        attempts: 0,
        history: [
          { status: "Received", at: now },
          { status: "Validated", at: now },
        ],
        createdAt: now,
        updatedAt: now,
      });
      executor.kick(intentId);
      return send(res, 202, view(store.get(intentId)!));
    }

    const m = url.pathname.match(/^\/intents\/(0x[0-9a-fA-F]{64})$/);
    if (req.method === "GET" && m) {
      const r = store.get(m[1]);
      return r ? send(res, 200, view(r)) : send(res, 404, { error: "not found" });
    }

    if (req.method === "GET" && url.pathname === "/intents") {
      const user = url.searchParams.get("user");
      return send(res, 200, (user ? store.byUser(user) : store.all()).map(view));
    }

    send(res, 404, { error: "not found" });
  } catch (e) {
    if (e instanceof ValidationError) return send(res, 400, { error: "validation failed", reasons: e.reasons });
    console.error(e);
    send(res, 500, { error: (e as Error).message.split("\n")[0] });
  }
});

server.listen(PORT, () => {
  console.log(`Ferry solver on :${PORT} — escrow ${escrow}, ferryMezo ${ferryMezo}, solver ${ctx.sepW.account.address}`);
  executor.resumeAll();
  setInterval(() => executor.resumeAll(), 60_000);
  startKeepAlive();
});
