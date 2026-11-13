"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { solver, type IntentStatus } from "@/lib/solver";
import { num, short } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { ConnectButton } from "@/components/ConnectButton";
import { Skeleton } from "@/components/ui";

const LABEL: Record<IntentStatus, string> = {
  Received: "Starting",
  Validated: "Repaying Aave",
  EthLegDone: "Opening Mezo loan",
  MezoLegDone: "Waiting for proof",
  VaaFetched: "Settling",
  Completed: "Done ✓",
  Failed: "Couldn’t start",
  AwaitingRefund: "Refund scheduled",
  Refunded: "Refunded",
};

export default function StatusList() {
  const { address } = useConnection();
  const q = useQuery({ queryKey: ["intents", address], enabled: !!address, queryFn: () => solver.byUser(address!), refetchInterval: 10_000 });

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>My migrations</h1>
      {!address && (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>Connect your wallet to see the loans you’ve moved with Ferry.</p>
          <div><ConnectButton /></div>
        </div>
      )}
      {address && q.isLoading && <div className="card"><Skeleton /></div>}
      {q.isError && <div className="alert alert-bad">{friendlyError(q.error)}</div>}
      {q.data?.length === 0 && (
        <div className="card">
          You haven’t moved a loan yet. <Link href="/migrate">Check your loan →</Link>
        </div>
      )}
      {q.data?.map((r) => (
        <Link key={r.id} href={`/status/${r.id}`} className="card row" style={{ textDecoration: "none", justifyContent: "space-between" }}>
          <div className="stack" style={{ gap: 2 }}>
            <b>{r.quote ? `${num(r.quote.mezoCollateral, 18, 4)} BTC · ${num(r.quote.troveDebt, 18, 0)} MUSD` : short(r.id)}</b>
            <span className="small muted">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
          <span className="tag">{LABEL[r.status] ?? r.status}</span>
        </Link>
      ))}
    </div>
  );
}
