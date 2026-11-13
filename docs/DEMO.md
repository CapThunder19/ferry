# Ferry: 2-minute demo video script

**Before recording**
- Open https://ferry-1-5541.onrender.com/health once, so the free solver is awake.
- MetaMask on **Sepolia**, a fresh account with ~0.01 Sepolia ETH that has never had a Mezo loan.
- On https://ferry-kappa-three.vercel.app/migrate click **Create a practice loan** first (4 transactions), so the video
  starts with a real Aave loan. Then reload the page.
- Solver needs ≥ 0.05 Mezo testnet BTC (`npm run balances -w solver`).
- Record at 1080p, browser zoom 110–125%, hide bookmarks. Keep the narration calm; cut waiting time in editing.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:15 | **Home**: hero + live rate card | “If you borrow against your Bitcoin on Aave, you pay a variable rate. Right now on testnet it’s about 64%. Mezo lends against Bitcoin at a fixed rate, 1% today. But switching means repaying Aave first, bridging, and opening a new loan by hand.” |
| 0:15–0:25 | Scroll to **How it works** | “Ferry does it in one guided flow. A solver fronts the money, so you don’t need cash up front, and the new loan is in your own name.” |
| 0:25–0:50 | **Move my loan**: “Your loan on Aave today”, then “Your new loan on Mezo”, then the health meter | “Ferry reads my Aave loan live: 0.045 WBTC against 1,850 USDC at a variable rate. On Mezo I keep the same Bitcoin, owe about 2,061 MUSD at 1% fixed, and save this much a year. The health meter and liquidation price show how safe the loan is.” Open **“Where does … MUSD come from?”** for 2 seconds. |
| 0:50–1:15 | Tick the 3 boxes, click **Sign & move my loan**, sign 2× on Sepolia, approve the network switch, sign on Mezo | “I confirm I understand the risks, then sign three free messages: two on Ethereum, one on Mezo, Mezo’s own loan approval. No gas on Mezo.” |
| 1:15–1:40 | **Status** page: progress bar, “Right now”, steps turning green; click the Mezo transaction link | “The solver repays my Aave loan and holds my WBTC in an escrow nobody controls. On Mezo, it opens a loan in my address with its own BTC. Wormhole then proves the loan exists before the escrow pays the solver back.” |
| 1:40–1:52 | **After · Mezo** card (Loan: Open ✓), the Mezo explorer showing my address | “Result: my Aave loan is closed and I have a fixed-rate Mezo loan in my name. If anything had failed, a timeout refund returns all my equity.” |
| 1:52–2:00 | Home | “Ferry: the on-ramp that brings Bitcoin borrowers to Mezo. Next: Morpho and Aave on Base, and an open solver network.” |

**If Wormhole testnet is slow:** the status stops at “Waiting for proof”. That’s fine: say “Wormhole now confirms the loan
across chains; the solver resends the proof automatically if it’s missed”, and show the Mezo loan as Open ✓.
