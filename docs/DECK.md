# Ferry: pitch deck outline

1. **Title.** Ferry: move your Bitcoin loan from Aave to Mezo in one flow. Mezo Buildathon, Track 1 + Track 2. Testnet live.

2. **Problem.**
   - BTC holders borrow stablecoins against WBTC on Aave at **variable** rates that swing with utilisation. On Sepolia today it's about 64%; mainnet history shows multi-week spikes into double digits.
   - Mezo offers BTC-backed loans at a **fixed** rate (1% promotional, 1–5% range).
   - Moving takes about 5 manual steps across 2 chains, a bridge, and **cash up front** to repay Aave before you can withdraw your BTC.

3. **Market.**
   - WBTC/cbBTC/tBTC collateral on Aave, Spark, Morpho and Compound: multi-billion-dollar BTC collateral with stablecoin debt against it.
   - Every refinance brings Mezo an existing borrower with real collateral (TVL + MUSD supply), not a new user to acquire.

4. **Solution.** A solver fronts both legs. The user signs two Sepolia messages and one Mezo message, and ends with a **Mezo trove in their own address**: same BTC, MUSD debt ≈ old debt, fixed rate.

5. **Demo.** Live migration (see DEMO.md): Before/After → signatures → status tracker → trove on Mezo.

6. **How it uses Mezo (depth).**
   - `BorrowerOperationsSignatures.openTroveWithSignature`: the trove opens for the user, funded by someone else.
   - Live reads: `PriceFeed`, `TroveManager.checkRecoveryMode`, `InterestRateManager`, `minNetDebt`, `borrowingRate`; hints via `HintHelpers` + `SortedTroves`.
   - MUSD is minted on Mezo and flows to the solver; the proof goes over Wormhole (Mezo chain 50 → Sepolia).
   - It extends an existing Mezo product (MUSD troves) and plugs into existing DeFi (Aave V3, Wormhole).

7. **Safety.** No-admin escrow on Ethereum; Ethereum leg first; Wormhole-proven release; permissionless timeout refund where the user never loses equity. 44 Solidity tests including fuzz, invariant and reentrancy.

8. **Business model.** Solver fee of 0.30% of the migrated debt, taken in MUSD. Volume grows with every rate spike on source markets. Later: a protocol fee on an open solver network.

9. **Traction / evidence.** Testnet deployments and a transaction for every milestone (EVIDENCE.md): Aave repay-on-behalf + escrow, Mezo trove opened via signature through FerryMezo, Wormhole VAA verified on Sepolia, refund path.

10. **Risks (and how we handle them).** MUSD debt instead of USDC, promotional rate, Recovery Mode, liquidation at 110%, min 1,800 MUSD, bridge risk, solver liveness. All are surfaced in the UI and covered in SECURITY.md.

11. **Roadmap (next 3 milestones).**
    1. Morpho Blue (Base) and Aave on Base as sources.
    2. Open solver network with bonded solvers.
    3. Mainnet launch with deposit caps after an audit.

12. **Team / ask.** Team, contact links, and what we want from Mezo: solver BTC liquidity and a listing in Mezo's app.

## AKINDO form crib

- **Name:** Ferry
- **Category (3–5 words):** BTC loan refinancing bridge
- **TL;DR:** Ferry moves your Bitcoin-backed Aave loan to a fixed-rate Mezo MUSD trove in one signed flow, with a solver fronting the money.
- **Track:** Track 1 + Track 2 · **Chain:** Mezo testnet + Ethereum Sepolia · **Status:** new project · **Readiness:** testnet
- **Tech stack:** Solidity 0.8 (Hardhat 3, OpenZeppelin), Wormhole core messaging, Aave V3, Mezo MUSD, TypeScript + viem solver, Next.js + wagmi app
