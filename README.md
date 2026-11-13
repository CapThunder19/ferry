# Ferry

**Move your Bitcoin-backed loan from Aave to Mezo's fixed-rate MUSD loan, in one flow.**

You have WBTC supplied on Aave with a variable-rate USDC/USDT loan against it. Variable rates swing; Mezo lends against
BTC at a **fixed** rate (1% promotional, 1–5% range). Moving by hand takes about five steps across two chains, and you need cash
to repay Aave first. Ferry's **solver fronts the money for both legs**. You sign messages and end with a **Mezo trove in
your own address**: same BTC as collateral, MUSD debt ≈ your old debt, fixed rate.

> **Testnet only** (Ethereum Sepolia + Mezo testnet), built for the Mezo Buildathon ("Build with MUSD and MEZO").
> Not audited. Never use with real funds.

- **How it works:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (Mermaid sequence diagram)
- **Security model & risks:** [docs/SECURITY.md](docs/SECURITY.md)
- **On-chain evidence (every testnet tx):** [docs/EVIDENCE.md](docs/EVIDENCE.md)
- **Demo video script:** [docs/DEMO.md](docs/DEMO.md) · **Pitch deck outline:** [docs/DECK.md](docs/DECK.md)

## How it works (30 seconds)

1. **Sepolia:** you sign a migration intent (EIP-712) and a permit for your aWBTC. **Mezo:** you sign Mezo's own
   `OpenTrove` message with the exact BTC and MUSD amounts. You need no gas on Mezo.
2. **Sepolia (`FerryEscrow`):** the solver repays your Aave debt on your behalf; your WBTC moves into an escrow with no owner.
3. **Mezo (`FerryMezo`):** the solver's BTC opens your trove via `BorrowerOperationsSignatures.openTroveWithSignature`.
   The minted MUSD repays the solver, and a proof goes out over **Wormhole**.
4. **Sepolia:** the guardian-signed VAA releases the escrowed WBTC to the solver.
   If the Mezo leg never happens, a permissionless **timeout refund** gives the solver exactly what it repaid and **you keep the rest**.

## Testnet deployments

| Contract | Chain | Address |
|---|---|---|
| FerryEscrow (6 h timeout) | Sepolia | [`0x454ccd1b625599a51e58899a29ba57c2d5da6204`](https://sepolia.etherscan.io/address/0x454ccd1b625599a51e58899a29ba57c2d5da6204) |
| FerryEscrow (5 min, refund demo) | Sepolia | [`0x23040744dd4067fbd868e1ce85a6adf7bfa77458`](https://sepolia.etherscan.io/address/0x23040744dd4067fbd868e1ce85a6adf7bfa77458) |
| FerryMezo | Mezo testnet (31611) | [`0xa11169c243a471a865fcd0dd64db70427d013cc0`](https://explorer.test.mezo.org/address/0xa11169c243a471a865fcd0dd64db70427d013cc0) |

Mezo MUSD system, Aave V3 Sepolia and Wormhole addresses: [shared/addresses.ts](shared/addresses.ts), all verified on chain by `npm run env-check`.

## Repository

```
contracts/   Hardhat 3: FerryEscrow (Sepolia), FerryMezo (Mezo), FerryTypes + Solidity unit/fuzz/invariant/reentrancy tests
solver/      TypeScript + viem: HTTP API, restart-safe state machine, milestone scripts (M0–M5), deploy, finalize
app/         Next.js + wagmi: live rate comparison, migration preview, multi-chain signing, status tracker, risks
shared/      addresses, ABIs, EIP-712 types, quote maths, chain readers (used by solver and app)
docs/        architecture, security, evidence, demo, deck
```

## Run it

Requirements: Node 24+, npm 11+.

```bash
npm install
cp .env.example .env          # testnet keys only (git-ignored)
npm run env-check             # M0: verifies every address, chain id, Mezo params, Wormhole cores (read-only)
npm run test:contracts        # 44 Solidity tests incl. fuzz + invariant
```

### Solver

```bash
npm run deploy -w solver      # FerryMezo on Mezo, FerryEscrow (+ short-timeout copy) + VaaVerifier on Sepolia → shared/deployments.json
npm start -w solver           # HTTP API on :8787  (GET /health /config /quote?user=  POST /intents  GET /intents/:id)
```

The solver wallet (`SOLVER_SEPOLIA_KEY` / `SOLVER_MEZO_KEY`) needs Sepolia ETH and Mezo testnet BTC
(≈ the user's WBTC amount per migration; [faucet](https://faucet.test.mezo.org)). Test USDC is minted from Aave's
permissionless Sepolia faucet automatically.

### App

```bash
cp app/.env.example app/.env.local
npm run dev:app               # http://localhost:3000
```

No Aave position? The Migrate page has a **"Create test Aave position"** button (Aave faucet → supply 0.045 WBTC → borrow 1,850 USDC).

### Milestone scripts (each prints explorer links)

| Script | Milestone |
|---|---|
| `npm run env-check` | M0 environment check |
| `npm run m1 -w solver` | M1 Mezo trove opened for a user via signature |
| `npm run m2 -w solver` | M2 FerryMezo → Wormhole → VAA verified on Sepolia |
| `npm run m3 -w solver` | M3 Aave repay-on-behalf + permit + withdraw into escrow |
| `npm run m4 -w solver` / `m4:refund` | M4 full migration / timeout refund |
| `npm run m5 -w solver` | M5 migration through the solver HTTP API |
| `npm run finalize -w solver -- <seq>` | finalize a pending migration once its VAA is signed |

## Mezo integration

- `BorrowerOperationsSignatures.openTroveWithSignature`: a third party funds a trove **owned by the user** (EIP-712 domain
  and `getNonce` read from source and verified on chain).
- Live reads of `PriceFeed`, `TroveManager.checkRecoveryMode` / `getTCR`, `BorrowerOperations.minNetDebt` / `borrowingRate`,
  `InterestRateManager.interestRate`; insert hints from `HintHelpers.getApproxHint` + `SortedTroves.findInsertPosition`.
- Trove read back on chain (`getTroveStatus`, `getTroveColl`, `getTroveDebt`) before paying the solver and attesting.
- Wormhole core messaging from Mezo (Wormhole chain id 50) to Ethereum.

## Roadmap

1. Morpho Blue (Base) and Aave on Base as sources.
2. Open solver network with bonded solvers.
3. Mainnet launch with deposit caps after an audit.
