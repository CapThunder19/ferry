"use client";

import type { ReactNode } from "react";
import { useChainId, useConnection } from "wagmi";
import { mezoTestnet, sepolia } from "@/lib/wagmi";
import { Boat } from "@/components/Logo";

/** A collapsible plain-language explanation. */
export function Explain({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="explain">
      <summary>{title}</summary>
      <div className="small muted">{children}</div>
    </details>
  );
}

/** Wizard header: which step of the migration the user is on. */
export function Wizard({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="wizard" aria-label="Progress">
      {steps.map((s, i) => (
        <div key={s} className={`w ${i < current ? "done" : i === current ? "now" : ""}`} aria-current={i === current ? "step" : undefined}>
          <span className="n">{i < current ? "✓" : i + 1}</span>
          {s}
        </div>
      ))}
    </div>
  );
}

/**
 * Collateral health meter. Scale 100%–250%: red below 120% (Ferry's minimum; Mezo liquidates at 110%),
 * amber 120–150% (at risk if Mezo enters Recovery Mode), green above 150%.
 */
export function HealthMeter({ icr }: { icr: bigint }) {
  const pct = Number(icr) / 1e16;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - 100) / 150) * 100))}%`;
  const label = pct < 120 ? "Too risky" : pct < 150 ? "OK, but watch it" : "Healthy";
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small muted">Collateral health</span>
        <span className="small">
          <b>{pct.toFixed(0)}%</b> · {label}
        </span>
      </div>
      <div className="meter" role="img" aria-label={`Collateral ratio ${pct.toFixed(0)} percent: ${label}`}>
        <div className="pin" style={{ left: pos(pct) }} />
      </div>
      <div className="meter-labels" aria-hidden>
        <span style={{ left: pos(110) }}>110% liquidation</span>
        <span style={{ left: pos(150) }}>150%</span>
        <span style={{ left: pos(225) }}>safer →</span>
      </div>
    </div>
  );
}

/** Shows which network the wallet is on. */
export function NetworkBadge() {
  const { status } = useConnection();
  const chainId = useChainId();
  if (status !== "connected") return null;
  const name = chainId === sepolia.id ? "Sepolia" : chainId === mezoTestnet.id ? "Mezo testnet" : "Unsupported network";
  return <span className={`netbadge ${name === "Unsupported network" ? "wrong" : ""}`}>{name}</span>;
}

/** The crossing: a dashed route from Aave to Mezo with a boat at `progress` (0–1). */
export function Route({ progress, from = "Aave · Ethereum", to = "Mezo" }: { progress: number; from?: string; to?: string }) {
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="route" role="img" aria-label={`Migration ${Math.round(p * 100)}% complete`}>
      <div className="boat" style={{ left: `${p * 100}%` }}><Boat /></div>
      <div className="line"><div className="done" style={{ width: `${p * 100}%` }} /></div>
      <div className="ports">
        <span><b>{from}</b></span>
        <span><b>{to}</b></span>
      </div>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}
