"use client";

import { useQuery } from "@tanstack/react-query";
import { readMezoParams, readRates } from "@ferry/shared/readers";
import { sepolia } from "@ferry/shared/addresses";
import { mezoClient, sepoliaClient } from "@/lib/wagmi";
import { usd } from "@/lib/format";

/** Live: Aave variable borrow APR (getReserveData) vs Mezo fixed rate (InterestRateManager.interestRate). */
export function RateCompare() {
  const q = useQuery({
    queryKey: ["rates"],
    queryFn: async () => {
      const [usdc, usdt, mz] = await Promise.all([
        readRates(sepoliaClient, mezoClient, sepolia.usdc),
        readRates(sepoliaClient, mezoClient, sepolia.usdt),
        readMezoParams(mezoClient),
      ]);
      return { usdc, usdt, mz };
    },
    refetchInterval: 60_000,
  });

  if (q.isError) return <div className="alert alert-bad">Could not read live rates: {(q.error as Error).message}</div>;
  const d = q.data;
  const exampleDebt = 10_000;
  const saving = d ? (exampleDebt * (d.usdc.aaveAprPct - d.usdc.mezoAprPct)) / 100 : 0;

  return (
    <div className="grid grid-3">
      <div className="card stat">
        <div className="label">Aave USDC variable APR (Sepolia, live)</div>
        <div className="value">{d ? `${d.usdc.aaveAprPct.toFixed(2)}%` : "…"}</div>
        <div className="small muted">USDT: {d ? `${d.usdt.aaveAprPct.toFixed(2)}%` : "…"} · changes every block</div>
      </div>
      <div className="card stat">
        <div className="label">Mezo MUSD fixed rate (live)</div>
        <div className="value accent">{d ? `${d.usdc.mezoAprPct.toFixed(2)}%` : "…"}</div>
        <div className="small muted">
          fixed for the life of your trove · BTC {d ? usd(Number(d.mz.btcPrice) / 1e18) : "…"} on Mezo
        </div>
      </div>
      <div className="card stat">
        <div className="label">Yearly interest saved on a {usd(exampleDebt)} loan</div>
        <div className="value">{d ? usd(saving) : "…"}</div>
        <div className="small muted">at today&apos;s testnet rates</div>
      </div>
    </div>
  );
}
