import Link from "next/link";
import { RateCompare } from "@/components/RateCompare";

const faq: [string, string][] = [
  ["Do I need cash to repay Aave first?", "No. A solver repays your Aave loan with its own money. It’s paid back from your WBTC on Ethereum and the new MUSD loan on Mezo, so you never have to find the cash yourself."],
  ["Do I need gas on Mezo?", "No. On Mezo you only sign a message. The solver sends the transaction and pays for it."],
  ["Who owns the new loan?", "You do. The Mezo loan (a “trove”) opens in your own wallet address. Repay, add collateral or close it in Mezo’s app whenever you like."],
  ["What if something goes wrong halfway?", "Your WBTC waits in an escrow contract nobody controls. If the Mezo loan isn’t opened in time, anyone can trigger a refund: the solver gets back exactly what it paid, and you get all the rest."],
  ["What does it cost?", "A 0.3% solver fee and Mezo’s 0.1% borrowing fee, both added to the new loan. Mezo also holds a 200 MUSD deposit that you get back when you close. Every number is shown before you sign."],
  ["Is this real money?", "No. Ferry runs on test networks only (Ethereum Sepolia and Mezo testnet), and the contracts are not audited."],
];

export default function Home() {
  return (
    <div className="stack" style={{ gap: 72 }}>
      <section className="hero">
        <div>
          <p className="eyebrow">For Bitcoin borrowers on Aave</p>
          <h1>
            Cross your loan
            <br />
            to a <em>fixed rate</em>.
          </h1>
          <p className="lead">
            Ferry moves your WBTC-backed loan from Aave to Mezo in one crossing. Same Bitcoin, no cash up front, and the
            new loan is in your own name.
          </p>
          <div className="row">
            <Link href="/migrate" className="btn btn-lg">
              Check my loan <span className="arrow">→</span>
            </Link>
            <Link href="/docs" className="btn btn-ghost btn-lg">How it works</Link>
          </div>
          <p className="mono-list" style={{ marginTop: 18 }}>~3 min · 3 signatures · 0 gas on Mezo</p>
        </div>
        <RateCompare />
      </section>

      <section>
        <p className="eyebrow">The crossing</p>
        <h2>You sign three times. The solver does the rowing.</h2>
        <ol className="steps-big" style={{ marginTop: 24 }}>
          <li>
            <span className="n">01</span>
            <h3>Check your loan</h3>
            <p>Connect your wallet. Ferry reads your Aave position and shows exactly what your Mezo loan would look like.</p>
          </li>
          <li>
            <span className="n">02</span>
            <h3>Sign three messages</h3>
            <p>Two on Ethereum, one on Mezo. Signing is free, and nothing moves until the solver takes over.</p>
          </li>
          <li>
            <span className="n">03</span>
            <h3>Watch it cross</h3>
            <p>The solver repays Aave, opens your Mezo loan and settles up. A live tracker shows every step.</p>
          </li>
        </ol>
      </section>

      <section className="grid grid-2" style={{ gap: 48, alignItems: "start" }}>
        <div className="panel">
          <p className="eyebrow">Safe passage</p>
          <h2>
            Your Bitcoin never depends on the solver’s <em>good will</em>.
          </h2>
          <p className="muted">
            Your WBTC waits in an escrow with no owner and no admin. It’s only released when a Wormhole proof confirms your
            Mezo loan exists. If that never happens, a refund returns all of your equity.
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
