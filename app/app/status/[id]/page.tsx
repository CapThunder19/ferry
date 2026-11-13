"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { readAavePosition, readTrove } from "@ferry/shared/readers";
import { solver, type IntentStatus } from "@/lib/solver";
import { mezoClient, sepoliaClient } from "@/lib/wagmi";
import { links, num, short } from "@/lib/format";

const ORDER: IntentStatus[] = ["Validated", "EthLegDone", "MezoLegDone", "VaaFetched", "Completed"];
const LABELS: Record<string, string> = {
  Validated: "Signatures and positions checked by the solver",
  EthLegDone: "Sepolia: Aave debt repaid, WBTC moved into escrow",
  MezoLegDone: "Mezo: trove opened in your name, proof sent through Wormhole",
  VaaFetched: "Wormhole guardians signed the proof (VAA)",
  Completed: "Sepolia: proof verified, escrow released to the solver",
};

export default function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({
    queryKey: ["intent", id],
    queryFn: () => solver.get(id),
    refetchInterval: (query) => (["Completed", "Failed", "Refunded"].includes(query.state.data?.status ?? "") ? false : 5_000),
  });
  const r = q.data;
  const done = r?.status === "Completed";
  const chain = useQuery({
    queryKey: ["intent-chain", id, r?.status],
    enabled: !!r,
    queryFn: async () => {
      const [trove, aave] = await Promise.all([readTrove(mezoClient, r!.user as Address), readAavePosition(sepoliaClient, r!.user as Address)]);
      return { trove, aave };
    },
  });

  if (q.isLoading) return <div className="card">Loading…</div>;
  if (q.isError || !r) return <div className="alert alert-bad">Intent not found: {(q.error as Error)?.message}</div>;

  const idx = ORDER.indexOf(r.status);
  const failed = r.status === "Failed";
  const linksFor = (s: IntentStatus) => {
    switch (s) {
      case "EthLegDone":
        return r.txs.ethLeg && <a href={links.sepTx(r.txs.ethLeg)} target="_blank" rel="noreferrer">Sepolia tx ↗</a>;
      case "MezoLegDone":
        return (
          <>
            {r.txs.mezoLeg && <a href={links.mezoTx(r.txs.mezoLeg)} target="_blank" rel="noreferrer">Mezo tx ↗</a>}
            <a href={links.mezoAddr(r.user)} target="_blank" rel="noreferrer">Your address on Mezo ↗</a>
          </>
        );
      case "VaaFetched":
        return r.wormholeSequence && <a href={links.vaa(r.ferryMezo, r.wormholeSequence)} target="_blank" rel="noreferrer">Wormholescan ↗</a>;
      case "Completed":
        return r.txs.finalize && <a href={links.sepTx(r.txs.finalize)} target="_blank" rel="noreferrer">Sepolia tx ↗</a>;
    }
  };

  return (
    <div className="stack">
      <div>
        <h1>{done ? "Your loan is on Mezo" : failed ? "Migration failed" : r.status === "Refunded" ? "Refunded" : "Migrating…"}</h1>
        <p className="muted small mono">intent {short(r.id)} · user {short(r.user)} · started {new Date(r.createdAt).toLocaleString()}</p>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Progress</h2>
          <ol className="steps">
            {ORDER.map((s, i) => {
              const state = i <= idx ? "done" : i === idx + 1 && !failed && r.status !== "Refunded" ? "active" : "";
              return (
                <li key={s} className={state}>
                  <span className="mark">{state === "done" ? "✓" : i + 1}</span>
                  <div>
                    <div className="title">{LABELS[s]}</div>
                    <div>{i <= idx && linksFor(s)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
          {r.status === "MezoLegDone" && (
            <p className="small muted">Waiting for Wormhole guardians to sign the proof. This usually takes a minute or two on testnet.</p>
          )}
          {r.status === "AwaitingRefund" && (
            <div className="alert alert-warn">The Mezo leg could not be completed. After the escrow timeout the WBTC is split: the solver gets back exactly what it repaid and you get the rest.</div>
          )}
          {r.status === "Refunded" && r.txs.refund && (
            <div className="alert alert-warn">
              Refunded after the timeout. <a href={links.sepTx(r.txs.refund)} target="_blank" rel="noreferrer">Refund tx ↗</a>
            </div>
          )}
          {r.error && !done && <div className="alert alert-bad small" style={{ marginTop: 8 }}>{r.error}</div>}
        </div>

        <div className="card">
          <h2>On chain now</h2>
          {chain.data ? (
            <table className="kv">
              <tbody>
                <tr><td>Aave WBTC collateral</td><td>{num(chain.data.aave.collateralAmount, 8, 6)}</td></tr>
                <tr><td>Aave USDC debt</td><td>{num(chain.data.aave.debtAmount, chain.data.aave.debtDecimals)}</td></tr>
                <tr><td>Mezo trove</td><td>{chain.data.trove.status}</td></tr>
                <tr><td>Trove collateral</td><td>{num(chain.data.trove.coll, 18, 6)} BTC</td></tr>
                <tr><td>Trove debt</td><td>{num(chain.data.trove.debt, 18)} MUSD</td></tr>
                <tr><td>Fixed rate</td><td>{(chain.data.trove.interestRateBps / 100).toFixed(2)}%</td></tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">Reading…</p>
          )}
          {done && (
            <p className="small muted">
              Manage your trove (repay, add collateral, close) in Mezo&apos;s app. Your MUSD debt accrues interest at the fixed rate above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
