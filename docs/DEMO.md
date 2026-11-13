# Ferry: 2-minute demo video script

**Setup before recording:** solver running (`npm start -w solver`), app running (`npm run dev -w app`) or the live
link, MetaMask on Sepolia with a fresh address holding ~0.01 Sepolia ETH, and the solver funded with ≥ 0.05 Mezo testnet BTC.
Create the Aave test position before recording (Migrate page → "Create test Aave position"), so the video starts with a real loan.

| Time | Screen | Voiceover |
|---|---|---|
| 0:00–0:15 | Home page, live rates card | "If you borrow against your Bitcoin on Aave, you pay a variable rate. Today on testnet that's about 64%. Mezo lends against BTC at a fixed rate, currently 1%. But moving takes five manual steps across two chains, and you need cash up front to repay Aave first." |
| 0:15–0:25 | Scroll to "How it works" | "Ferry does the move in one flow. A solver fronts the money for both legs. You just sign." |
| 0:25–0:45 | Migrate page: Before/After cards, debt breakdown, savings | "Ferry reads my Aave position live: 0.045 WBTC against 1,850 USDC. On Mezo I'd have the same BTC as collateral and about 2,061 MUSD of debt. That includes the 0.3% solver fee, Mezo's 0.1% fee and the 200 MUSD gas deposit I get back on close. It shows my collateral ratio, my liquidation price, and that my debt becomes MUSD." |
| 0:45–1:10 | Click "Sign & migrate": two Sepolia signatures, network switch, Mezo signature | "Two signatures on Sepolia: the migration intent and a permit for my aWBTC. My wallet switches to Mezo, and I sign Mezo's own OpenTrove message with the exact amounts. I don't need any gas on Mezo." |
| 1:10–1:35 | Status page: steps tick through, click explorer links | "The solver repays my Aave loan and my WBTC goes into an escrow contract. On Mezo, it opens a trove in my own address with its BTC. Wormhole carries the proof back, and only then is the escrow released to the solver." |
| 1:35–1:50 | Mezo explorer: trove owner = my address; Aave: debt 0 | "Result: my Aave loan is closed, and I have a fixed-rate Mezo loan in my name. If anything had failed, a timeout refund returns all my equity. That path is tested on chain too." |
| 1:50–2:00 | Home, logo | "Ferry: the on-ramp that brings Bitcoin borrowers to Mezo. Next: Morpho and Aave on Base as sources, and an open solver network." |

**Fallback if the Wormhole testnet is slow:** show a completed migration from `/status`, and the evidence log
(`docs/EVIDENCE.md`) with the transaction links for every step.
