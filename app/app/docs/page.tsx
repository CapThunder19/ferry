import { mezo, sepolia } from "@ferry/shared/addresses";
import deployments from "@ferry/shared/deployments.json";
import { links } from "@/lib/format";

const risks: [string, string, string][] = [
  ["Your debt changes currency", "You owe MUSD (Mezo's BTC-backed stablecoin) instead of USDC/USDT. MUSD aims for $1 but is a different asset.", "Shown before signing; MUSD is redeemable against BTC on Mezo."],
  ["Liquidation at 110%", "If BTC falls so that your collateral is worth less than 110% of your MUSD debt, your trove can be liquidated.", "Ferry refuses migrations below 120% collateral ratio, warns below 150%, and shows your liquidation price."],
  ["Recovery Mode", "If the whole Mezo system drops below 150% collateralisation, troves under 150% can be liquidated and withdrawals are blocked.", "Ferry checks Recovery Mode before every Mezo leg and warns when your ratio is under 150%."],
  ["Promotional rate", "Mezo's current 1% rate is promotional (range 1–5%). Your rate is fixed when your trove opens and stays until you refinance.", "The live rate is read from InterestRateManager at quote time."],
  ["Minimum debt", "A Mezo trove needs at least 1,800 MUSD of net debt, plus 200 MUSD gas compensation that you get back when you close.", "Smaller Aave loans are rejected up front."],
  ["Bridge risk", "The Sepolia escrow releases your WBTC to the solver only on a Wormhole guardian-signed proof that your trove exists.", "If no proof arrives, the timeout refund returns all your equity. Anyone can republish a proof the guardians missed."],
  ["Solver liveness", "A solver could repay your Aave loan and then never open your trove.", "After the timeout, anyone can refund: the solver gets exactly what it repaid (Aave oracle price, rounded in your favour) and you get the rest."],
  ["One trove per address", "Mezo allows one trove per address. If you already have one, Ferry can't open another.", "Detected before signing. Adding to an existing trove is on the roadmap."],
  ["Testnet only, not audited", "This is a hackathon prototype on Sepolia and Mezo testnet.", "Do not use with real funds."],
];

export default function DocsPage() {
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>How Ferry works</h1>
      <p className="lead">
        Ferry moves a Bitcoin-backed loan from Aave on Ethereum to a fixed-rate MUSD loan on Mezo. A solver fronts the money
        for both legs, so you don&apos;t need cash to repay Aave first, and you don&apos;t need gas on Mezo.
      </p>

      <div className="card">
        <h2>The flow</h2>
        <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>You sign a <b>migration intent</b> (EIP-712) and a <b>permit</b> for your aWBTC on Sepolia. You sign Mezo&apos;s own <b>OpenTrove</b> message on Mezo testnet with the exact BTC and MUSD amounts.</li>
          <li>The solver checks your signatures, your Aave position, Mezo&apos;s Recovery Mode, your future collateral ratio and its own inventory, then simulates both legs.</li>
          <li><b>Sepolia:</b> <code>FerryEscrow.executeEthLeg</code> repays your Aave debt on your behalf with the solver&apos;s USDC, pulls your aWBTC with the permit, withdraws the WBTC and holds it in escrow. It reverts unless your Aave debt reaches zero.</li>
          <li><b>Mezo:</b> <code>FerryMezo.executeMezoLeg</code> sends the solver&apos;s BTC into <code>BorrowerOperationsSignatures.openTroveWithSignature</code>. The trove opens <b>in your address</b>. The minted MUSD goes to the solver, and FerryMezo publishes a Wormhole message describing your trove.</li>
          <li><b>Sepolia:</b> <code>FerryEscrow.finalize</code> verifies the guardian-signed VAA, checks the emitter, your address, collateral and debt, and releases the escrowed WBTC to the solver.</li>
          <li>If step 4 never happens, <code>refund</code> after the timeout pays the solver exactly the value it repaid and returns the rest to you.</li>
        </ol>
      </div>

      <div className="card">
        <h2>Risks</h2>
        <table className="kv">
          <thead>
            <tr><th>Risk</th><th style={{ textAlign: "left" }}>What it means</th><th style={{ textAlign: "left" }}>Mitigation</th></tr>
          </thead>
          <tbody>
            {risks.map(([r, what, mit]) => (
              <tr key={r}>
                <td style={{ fontWeight: 600, paddingRight: 12 }}>{r}</td>
                <td className="small" style={{ textAlign: "left", paddingRight: 12 }}>{what}</td>
                <td className="small muted" style={{ textAlign: "left" }}>{mit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Contracts (testnet)</h2>
        <table className="kv small">
          <tbody>
            <tr><td>FerryEscrow (Sepolia)</td><td><a href={links.sepAddr(deployments.sepolia.ferryEscrow)} target="_blank" rel="noreferrer" className="mono">{deployments.sepolia.ferryEscrow}</a></td></tr>
            <tr><td>FerryMezo (Mezo testnet)</td><td><a href={links.mezoAddr(deployments.mezo.ferryMezo)} target="_blank" rel="noreferrer" className="mono">{deployments.mezo.ferryMezo}</a></td></tr>
            <tr><td>Aave V3 Pool (Sepolia)</td><td className="mono">{sepolia.aavePool}</td></tr>
            <tr><td>Mezo BorrowerOperationsSignatures</td><td className="mono">{mezo.borrowerOperationsSignatures}</td></tr>
            <tr><td>Wormhole core (Mezo / Sepolia)</td><td className="mono">{mezo.wormholeCore} / {sepolia.wormholeCore}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
