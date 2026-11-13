# Ferry build checkpoints (full scope of FERRY_BUILD_PROMPT.md)

Each checkpoint = one commit you can push. **[chain]** = needs funded testnet keys; tx links go into `docs/EVIDENCE.md`.

| CP | Milestone | What | Commit message |
|---|---|---|---|
| 01 | — | Repo scaffold: `.gitignore`, `.env.example`, folders, README stub, Foundry config, solver package | `chore: scaffold ferry monorepo` |
| 02 | — | Contract interfaces (Aave, Mezo MUSD, Wormhole) | `chore(contracts): aave, mezo and wormhole interfaces` |
| 03 | M0 | Environment check script + report **[chain, read-only]** | `feat(m0): environment check script and report` |
| 04 | — | `FerryTypes.sol` (intent, EIP-712, payload codec) + tests | `feat(contracts): FerryTypes intent hashing and payload codec` |
| 05 | M1 | Open Mezo trove for user via signature **[chain]** | `feat(m1): open mezo trove for user via signature` |
| 06 | — | `FerryMezo.sol` full `executeMezoLeg` + tests | `feat(contracts): FerryMezo opens trove, pays solver, emits proof` |
| 07 | M2 | Deploy FerryMezo, publish message, fetch VAA, verify on Sepolia **[chain]** | `feat(m2): mezo→sepolia wormhole message verified on chain` |
| 08 | — | `FerryEscrow.sol` eth leg + finalize + refund + tests | `feat(contracts): FerryEscrow eth leg, VAA finalize and timeout refund` |
| 09 | M3 | Aave test position + eth leg on Sepolia **[chain]** | `feat(m3): aave leg executed into escrow on sepolia` |
| 10 | M4 | E2E script: happy path + refund path **[chain]** | `feat(m4): end-to-end migration and refund path` |
| 11 | M5 | Solver core: config, clients, store, state machine | `feat(solver): config, clients and persistent intent store` |
| 12 | M5 | Validation, inventory, quoting | `feat(solver): intent validation, inventory checks and quoting` |
| 13 | M5 | Executor + HTTP API **[chain]** | `feat(m5): solver http api runs full migration` |
| 14 | M6 | App scaffold + Home (live rates) | `feat(app): scaffold with live aave vs mezo rate comparison` |
| 15 | M6 | Migrate page: position + preview + warnings | `feat(app): migrate page with migration preview` |
| 16 | M6 | Signing flow + submit | `feat(app): multi-chain signing and intent submission` |
| 17 | M6 | Status + Docs/Risks pages, deploy **[chain]** | `feat(m6): status tracker, risks page, browser migration` |
| 18 | M7 | Fuzz, invariant, reentrancy tests, coverage | `test(contracts): fuzz, invariant and reentrancy suites` |
| 19 | M7 | Slither fixes + CI | `chore: slither fixes and CI` |
| 20 | M8 | ARCHITECTURE.md, SECURITY.md | `docs: architecture and security model` |
| 21 | M8 | README, DEMO.md, DECK.md, final EVIDENCE.md | `docs: readme, demo script, deck outline, evidence` |

Stretch: add-to-existing-trove (`addCollWithSignature` / `withdrawMUSDWithSignature`).

## Prerequisites I will ask for when needed
- Foundry installed (CP02)
- `.env` with testnet keys (CP03 read-only works without keys)
- Mezo testnet BTC for the solver (≈0.025+ BTC per migration: min trove debt ~2,000 MUSD at ≥120% ICR) — CP05
- Aave Sepolia faucet WBTC for the user + USDC for the solver — CP09
