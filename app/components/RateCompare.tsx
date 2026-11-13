"use client";

import { useQuery } from "@tanstack/react-query";
import { readMezoParams, readRates } from "@ferry/shared/readers";
import { sepolia } from "@ferry/shared/addresses";
import { mezoClient, sepoliaClient } from "@/lib/wagmi";
import { usd } from "@/lib/format";

const EXAMPLE_DEBT = 10_000;

/** Live: Aave variable borrow APR (getReserveData) vs Mezo fixed rate (InterestRateManager.interestRate). */
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
  const aaveCost = d ? (EXAMPLE_DEBT * d.usdc.aaveAprPct) / 100 : 0;
  const mezoCost = d ? (EXAMPLE_DEBT * d.usdc.mezoAprPct) / 100 : 0;

  return (
    <div className="card stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>Borrowing {usd(EXAMPLE_DEBT)} against your BTC</b>
        <span className="tag">live · testnet</span>
      </div>
      <div className="compare">
        <div className="side">
          <div className="small muted">Aave today</div>
          <div className="big">{d ? `${d.usdc.aaveAprPct.toFixed(1)}%` : "…"}</div>
          <div className="small muted">variable: it changes every block</div>
          <div className="small" style={{ marginTop: 8 }}>≈ {d ? usd(aaveCost) : "…"} / year</div>
        </div>
        <div className="arrow" aria-hidden>→</div>
        <div className="side after">
          <div className="small muted">Mezo with Ferry</div>
          <div className="big" style={{ color: "var(--accent)" }}>{d ? `${d.usdc.mezoAprPct.toFixed(1)}%` : "…"}</div>
          <div className="small muted">fixed for the life of your loan</div>
          <div className="small" style={{ marginTop: 8 }}>≈ {d ? usd(mezoCost) : "…"} / year</div>
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Rates read live from Aave V3 on Sepolia and Mezo’s InterestRateManager. Testnet rates can be extreme; the 1% Mezo rate is promotional (range 1–5%).
        BTC on Mezo: {d ? usd(Number(d.mz.btcPrice) / 1e18) : "…"}.
      </p>
    </div>
  );
}
