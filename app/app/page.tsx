import Link from "next/link";
import { RateCompare } from "@/components/RateCompare";

export default function Home() {
  return (
    <div className="stack">
      <section>
        <h1>
          Move your Bitcoin loan
          <br />
          from Aave to Mezo. <span style={{ color: "var(--accent)" }}>One flow.</span>
        </h1>
        <p className="lead">
          You have WBTC on Aave and a variable-rate stablecoin loan against it. Ferry repays it, moves your BTC and opens a
          fixed-rate MUSD loan on Mezo <b>in your own address</b>. You sign two messages. You need no cash up front and no gas on Mezo.
        </p>
        <div className="row">
          <Link href="/migrate" className="btn btn-lg">
            Migrate my loan →
          </Link>
          <Link href="/docs" className="btn btn-ghost btn-lg">
            How it works & risks
          </Link>
        </div>
      </section>

      <div className="spacer" />
      <RateCompare />

      <div className="spacer" />
      <section>
        <h2>How it works</h2>
        <div className="flow">
          <div className="card">
            <h3>You sign on Sepolia</h3>
            <p className="small muted">A migration intent and a permit for your aWBTC. Nothing moves yet.</p>
          </div>
          <div className="card">
            <h3>You sign on Mezo</h3>
            <p className="small muted">Mezo&apos;s own OpenTrove message: the exact BTC and MUSD amounts of your new loan.</p>
          </div>
          <div className="card">
            <h3>Solver repays Aave</h3>
            <p className="small muted">It repays your debt with its own USDC; your WBTC goes into an escrow contract.</p>
          </div>
          <div className="card">
            <h3>Solver opens your trove</h3>
            <p className="small muted">It fronts the BTC on Mezo. Your trove opens in your name and the new MUSD repays the solver.</p>
          </div>
          <div className="card">
            <h3>Wormhole proves it</h3>
            <p className="small muted">A guardian-signed message proves the trove exists; only then is the escrowed WBTC released to the solver.</p>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          If the Mezo leg never happens, anyone can trigger a refund after the timeout: the solver gets back exactly what it
          repaid, you keep all your remaining BTC.
        </p>
      </section>
    </div>
  );
}
