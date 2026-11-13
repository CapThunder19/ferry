"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { solver } from "@/lib/solver";
import { short } from "@/lib/format";

export default function StatusList() {
  const { address } = useConnection();
  const q = useQuery({ queryKey: ["intents", address], enabled: !!address, queryFn: () => solver.byUser(address!), refetchInterval: 10_000 });

  return (
    <div className="stack">
      <h1>Your migrations</h1>
      {!address && <div className="card">Connect your wallet to see your migrations.</div>}
      {q.isError && <div className="alert alert-bad">Solver unreachable: {(q.error as Error).message}</div>}
      {q.data?.length === 0 && (
        <div className="card">
          No migrations yet. <Link href="/migrate">Start one →</Link>
        </div>
      )}
      {q.data?.map((r) => (
        <Link key={r.id} href={`/status/${r.id}`} className="card row" style={{ textDecoration: "none", justifyContent: "space-between" }}>
          <span className="mono">{short(r.id)}</span>
          <span>{r.status}</span>
          <span className="muted small">{new Date(r.createdAt).toLocaleString()}</span>
        </Link>
      ))}
    </div>
  );
}
