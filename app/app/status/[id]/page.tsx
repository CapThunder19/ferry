"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { readAavePosition, readTrove } from "@ferry/shared/readers";
import { solver, type IntentStatus, type IntentView } from "@/lib/solver";
import { mezoClient, sepoliaClient } from "@/lib/wagmi";
import { links, num, short } from "@/lib/format";
import { Route, Skeleton } from "@/components/ui";

const ORDER: IntentStatus[] = ["Validated", "EthLegDone", "MezoLegDone", "VaaFetched", "Completed"];

const STEP: Record<string, { title: string; detail: string }> = {
  Validated: { title: "Checked your request", detail: "The solver verified your signatures, your Aave loan and Mezo’s current state." },
  EthLegDone: { title: "Repaid your Aave loan", detail: "Your Aave debt is paid off and your WBTC is held in Ferry’s escrow on Ethereum." },
  MezoLegDone: { title: "Opened your Mezo loan", detail: "A Mezo loan now exists in your address, backed by the same amount of BTC." },
  VaaFetched: { title: "Got the cross-chain proof", detail: "Wormhole confirmed to Ethereum that your Mezo loan is real." },
  Completed: { title: "Settled up", detail: "The escrow paid the solver back. Your migration is complete." },
};

const NOW: Partial<Record<IntentStatus, string>> = {
  Received: "Checking your request…",
  Validated: "Repaying your Aave loan on Ethereum. This usually takes under a minute.",
  EthLegDone: "Opening your loan on Mezo. This usually takes under a minute.",
  MezoLegDone:
    "Waiting for Wormhole to confirm your Mezo loan to Ethereum. This normally takes a minute or two; if Wormhole misses it, the solver resends the proof automatically. Your new loan is already open.",
  VaaFetched: "Settling the escrow on Ethereum…",
  AwaitingRefund:
    "The Mezo step couldn’t be completed. Your WBTC is safe in the escrow. After the timeout the solver gets back exactly what it paid and you get the rest.",
};

function useElapsed(from?: string, stop?: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (stop) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [stop]);
  if (!from) return "";
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function stepLinks(r: IntentView, s: IntentStatus) {
  const a = (href: string, label: string) => (
    <a key={href} href={href} target="_blank" rel="noreferrer">{label} ↗</a>
  );
  switch (s) {
    case "EthLegDone":
      return r.txs.ethLeg && a(links.sepTx(r.txs.ethLeg), "Ethereum transaction");
    case "MezoLegDone":
      return [
        r.txs.mezoLeg && a(links.mezoTx(r.txs.mezoLeg), "Mezo transaction"),
        a(links.mezoAddr(r.user), "Your address on Mezo"),
        ...(r.republishes ?? []).filter((p) => p.hash !== "0x").map((p) => a(links.mezoTx(p.hash), `Proof resent (#${p.sequence})`)),
      ];
    case "VaaFetched":
      return r.wormholeSequence && a(links.vaa(r.ferryMezo, r.wormholeSequence), "Wormhole proof");
    case "Completed":
      return r.txs.finalize && a(links.sepTx(r.txs.finalize), "Settlement transaction");
  }
}

export default function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [copied, setCopied] = useState(false);
  const q = useQuery({
    queryKey: ["intent", id],
    queryFn: () => solver.get(id),
    refetchInterval: (query) => (["Completed", "Failed", "Refunded"].includes(query.state.data?.status ?? "") ? false : 5_000),
  });
  const r = q.data;
  const done = r?.status === "Completed";
  const terminal = !!r && ["Completed", "Failed", "Refunded"].includes(r.status);
  const elapsed = useElapsed(r?.createdAt, terminal);

  const chain = useQuery({
    queryKey: ["intent-chain", id, r?.status],
    enabled: !!r,
    queryFn: async () => {
      const [trove, aave] = await Promise.all([
        readTrove(mezoClient, r!.user as Address),
        readAavePosition(sepoliaClient, r!.user as Address, r!.intent.debtAsset),
      ]);
      return { trove, aave };
    },
  });

  if (q.isLoading) return <div className="card"><Skeleton lines={4} /></div>;
  if (q.isError || !r)
    return (
      <div className="alert alert-bad">
        We couldn’t find this migration. The solver may be waking up; refresh in a minute. <Link href="/status">See all migrations</Link>
      </div>
    );

  const idx = ORDER.indexOf(r.status);
  const progress = done ? 100 : r.status === "Refunded" ? 100 : Math.max(5, ((idx + 1) / ORDER.length) * 100);
  const headline =
    done ? "Arrived. Your loan is now on Mezo."
    : r.status === "Failed" ? "This migration couldn’t start"
    : r.status === "Refunded" ? "Refunded: your equity is back"
    : r.status === "AwaitingRefund" ? "Paused: refund scheduled"
    : "Crossing in progress…";

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="stack" style={{ gap: 10 }}>
        <h1 style={{ margin: 0 }}>{headline}</h1>
        <Route progress={progress / 100} />
        <div className="row small muted" style={{ justifyContent: "space-between" }}>
          <span>{terminal ? `Finished in ${elapsed}` : `Running for ${elapsed}`} · migration {short(r.id)}</span>
          <button
            className="btn btn-ghost"
            style={{ padding: "4px 10px", fontSize: "0.85rem" }}
            onClick={() => navigator.clipboard.writeText(window.location.href).then(() => setCopied(true))}
          >
            {copied ? "Link copied ✓" : "Copy link to this page"}
          </button>
        </div>
      </div>

      {NOW[r.status] && (
        <div className={`alert ${r.status === "AwaitingRefund" ? "alert-warn" : "alert-good"} callout`}>
          <span className="icon" aria-hidden>{r.status === "AwaitingRefund" ? "!" : "→"}</span>
          <span><b>Right now:</b> {NOW[r.status]}</span>
        </div>
      )}
      {r.status === "Failed" && <div className="alert alert-bad">{r.error ?? "The solver couldn’t start this migration."} Nothing was moved.</div>}
      {r.status === "Refunded" && r.txs.refund && (
        <div className="alert alert-warn">
          Your WBTC was split after the timeout: the solver got back exactly what it paid, and you received the rest.{" "}
          <a href={links.sepTx(r.txs.refund)} target="_blank" rel="noreferrer">Refund transaction ↗</a>
        </div>
      )}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Steps</h2>
          <ol className="steps">
            {ORDER.map((s, i) => {
              const state = i <= idx ? "done" : i === idx + 1 && !terminal && r.status !== "AwaitingRefund" ? "active" : "";
              return (
                <li key={s} className={state}>
                  <span className="mark">{state === "done" ? "✓" : i + 1}</span>
                  <div>
                    <div className="title">{STEP[s].title}</div>
                    <div className="small muted">{STEP[s].detail}</div>
                    <div>{i <= idx && stepLinks(r, s)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="stack">
          <div className="card">
            <p className="eyebrow">Before · Aave</p>
            {chain.data ? (
              <table className="kv">
                <tbody>
                  <tr><td>WBTC supplied</td><td>{num(chain.data.aave.collateralAmount, 8, 4)}</td></tr>
                  <tr><td>Stablecoin owed</td><td>{num(chain.data.aave.debtAmount, chain.data.aave.debtDecimals)}</td></tr>
                </tbody>
              </table>
            ) : <Skeleton lines={2} />}
          </div>
          <div className="card">
            <p className="eyebrow">After · Mezo</p>
            {chain.data ? (
              <table className="kv">
                <tbody>
                  <tr><td>Loan</td><td>{chain.data.trove.status === "active" ? "Open ✓" : chain.data.trove.status === "nonExistent" ? "Not opened yet" : chain.data.trove.status}</td></tr>
                  <tr><td>BTC collateral</td><td>{num(chain.data.trove.coll, 18, 4)}</td></tr>
                  <tr><td>MUSD owed</td><td>{num(chain.data.trove.debt, 18)}</td></tr>
                  <tr><td>Interest</td><td>{(chain.data.trove.interestRateBps / 100).toFixed(1)}% fixed</td></tr>
                </tbody>
              </table>
            ) : <Skeleton lines={3} />}
            {chain.data?.trove.status === "active" && (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Manage it (repay, add BTC, close) in Mezo’s app at <a href="https://testnet.mezo.org" target="_blank" rel="noreferrer">testnet.mezo.org ↗</a>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
