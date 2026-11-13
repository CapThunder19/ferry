"use client";

import { useQuery } from "@tanstack/react-query";
import { readMezoParams, readRates } from "@ferry/shared/readers";
import { sepolia } from "@ferry/shared/addresses";
import { mezoClient, sepoliaClient } from "@/lib/wagmi";
import { usd } from "@/lib/format";

const EXAMPLE_DEBT = 10_000;

/** Live rates presented as a ferry ticket: Port Aave (variable) → Port Mezo (fixed). */
export function RateCompare() {
  const q = useQuery({
    queryKey: ["rates"],
    queryFn: async () => {
      const [usdc, mz] = await Promise.all([readRates(sepoliaClient, mezoClient, sepolia.usdc), readMezoParams(mezoClient)]);
      return { usdc, mz };
    },
    refetchInterval: 60_000,
  });

  if (q.isError) return <div className="alert alert-bad">Couldn’t read live rates right now. Please refresh in a moment.</div>;
  const d = q.data;
  const fare = (pct: number) => usd((EXAMPLE_DEBT * pct) / 100);

  return (
    <div className="ticket" aria-label="Live rate comparison">
      <div className="stub">
        <span className="label">From</span>
        <span className="port">Aave</span>
        <span className="meta">Ethereum · USDC loan</span>
        <span className="rate var" style={{ marginTop: 14 }}>{d ? `${d.usdc.aaveAprPct.toFixed(1)}%` : "—"}</span>
        <span className="meta">variable · moves every block</span>
      </div>
      <div className="tear" aria-hidden />
      <div className="stub to">
        <span className="label">To</span>
        <span className="port">Mezo</span>
        <span className="meta">Bitcoin L2 · MUSD loan</span>
        <span className="rate fix" style={{ marginTop: 14 }}>{d ? `${d.usdc.mezoAprPct.toFixed(1)}%` : "—"}</span>
        <span className="meta">fixed · locked at open</span>
      </div>
      <div className="foot">
        <span>
          on {usd(EXAMPLE_DEBT)}/yr: {d ? fare(d.usdc.aaveAprPct) : "—"} → {d ? fare(d.usdc.mezoAprPct) : "—"}
        </span>
        <span>BTC {d ? usd(Number(d.mz.btcPrice) / 1e18) : "—"} · live testnet</span>
      </div>
    </div>
  );
}
