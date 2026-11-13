import Link from "next/link";
import { RateCompare } from "@/components/RateCompare";

const faq: [string, string][] = [
  ["Do I need cash to repay Aave first?", "No. A solver repays your Aave loan with its own money. It gets paid back from your WBTC (on Ethereum) and the new MUSD loan (on Mezo), so you never need to find the cash yourself."],
  ["Do I need gas on Mezo?", "No. On Mezo you only sign a message. The solver sends the transaction and pays for it."],
  ["Who owns the new loan?", "You do. The Mezo loan (a “trove”) is opened in your own wallet address. You can repay, add collateral or close it in Mezo’s app at any time."],
  ["What if something goes wrong halfway?", "Your WBTC waits in an escrow contract that nobody controls. If the Mezo loan isn’t opened in time, anyone can trigger a refund: the solver gets back exactly what it paid, and you get all the rest."],
  ["What does it cost?", "A 0.3% solver fee and Mezo’s 0.1% borrowing fee, both added to your new loan. Mezo also holds a 200 MUSD deposit that you get back when you close the loan. Ferry shows every number before you sign."],
  ["Is this real money?", "No. Ferry runs on test networks only (Ethereum Sepolia and Mezo testnet). The contracts are not audited."],
];

export default function Home() {
  return (
    <div className="stack" style={{ gap: 56 }}>
      <section className="hero">
        <div>
          <p className="eyebrow">For Bitcoin borrowers on Aave</p>
          <h1>
            Swap your floating-rate loan for a <span style={{ color: "var(--accent)" }}>fixed rate</span> on Mezo.
          </h1>
          <p className="lead">
            Ferry moves your WBTC-backed loan from Aave to Mezo in one guided flow. You keep the same Bitcoin, you don’t need
            cash up front, and the new loan is in your own name.
          </p>
          <div className="row">
            <Link href="/migrate" className="btn btn-lg">Check my loan →</Link>
            <Link href="/docs" className="btn btn-ghost btn-lg">How it works</Link>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>Takes about 3 minutes · 3 signatures · no gas on Mezo</p>
        </div>
        <RateCompare />
      </section>

      <section>
        <p className="eyebrow">How it works</p>
        <h2>Three steps for you. The rest happens on its own.</h2>
        <div className="grid grid-3" style={{ marginTop: 16 }}>
          <div className="card">
            <h3>1 · Check your loan</h3>
            <p className="small muted">Connect your wallet. Ferry reads your Aave position and shows exactly what your Mezo loan would look like.</p>
          </div>
          <div className="card">
            <h3>2 · Sign three messages</h3>
            <p className="small muted">Two on Ethereum, one on Mezo. Signing is free, and nothing moves until the solver takes over.</p>
          </div>
          <div className="card">
            <h3>3 · Watch it move</h3>
            <p className="small muted">The solver repays Aave, opens your Mezo loan and settles up. A live tracker shows every step with links.</p>
          </div>
        </div>
      </section>

      <section className="grid grid-2" style={{ alignItems: "start" }}>
        <div>
          <p className="eyebrow">Built to be safe</p>
          <h2>Your Bitcoin is never at the mercy of the solver.</h2>
          <p className="muted">
            Your WBTC sits in an escrow contract with no owner and no admin. It’s only released after a Wormhole proof confirms
            your Mezo loan exists. If that never happens, a refund returns all your equity.
          </p>
          <Link href="/docs">Read the risks →</Link>
        </div>
        <div className="faq">
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
