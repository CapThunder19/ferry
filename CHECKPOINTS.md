# Ferry build checkpoints (full scope of FERRY_BUILD_PROMPT.md)

Each checkpoint = one commit you can push. **[chain]** = needs funded testnet keys; tx links go into `docs/EVIDENCE.md`.
Code that needs no keys is built first; on-chain milestones run once the wallets are funded.

| CP | Status | Milestone | What | Commit message |
|---|---|---|---|---|
| 01 | ✅ | — | Repo scaffold | `chore: scaffold ferry monorepo` |
| 02 | ✅ | — | Hardhat 3 + npm workspaces + Aave/Mezo/Wormhole interfaces + shared addresses/ABIs | `chore: hardhat 3 workspace, contract interfaces and shared config` |
| 03 | ✅ | M0 | Environment check script + report (33/33 pass) | `feat(m0): environment check script and report` |
| 04 | ✅ | — | `FerryTypes`, `FerryMezo`, `FerryEscrow`, `VaaVerifier` + mocks + unit/fuzz tests | `feat(contracts): FerryEscrow, FerryMezo, FerryTypes with unit and fuzz tests` |
| 05 | ✅ | M7 | Invariant + reentrancy tests (43 passing) | `test(contracts): invariant and reentrancy suites` |
| 06 | ⏳ | M1 | Open Mezo trove for user via signature **[chain]** | `feat(m1): open mezo trove for user via signature` |
| 07 | ⏳ | M2 | Deploy FerryMezo + VaaVerifier, ping, fetch VAA, verify on Sepolia **[chain]** | `feat(m2): mezo→sepolia wormhole message verified on chain` |
| 08 | ⏳ | M3 | Aave test position + eth leg into escrow **[chain]** | `feat(m3): aave leg executed into escrow on sepolia` |
| 09 | ⏳ | M4 | E2E script: happy path + refund path **[chain]** | `feat(m4): end-to-end migration and refund path` |
| 10 | ⏳ | M5 | Solver core: config, store, state machine, validation, quoting | `feat(solver): intent store, validation and quoting` |
| 11 | ⏳ | M5 | Executor + HTTP API **[chain]** | `feat(m5): solver http api runs full migration` |
| 12 | ⏳ | M6 | App scaffold + Home (live rates) | `feat(app): scaffold with live aave vs mezo rate comparison` |
| 13 | ⏳ | M6 | Migrate page: position, preview, warnings | `feat(app): migrate page with migration preview` |
| 14 | ⏳ | M6 | Signing flow + submit | `feat(app): multi-chain signing and intent submission` |
| 15 | ⏳ | M6 | Status + Docs/Risks pages, deploy **[chain]** | `feat(m6): status tracker, risks page, browser migration` |
| 16 | ⏳ | M7 | Coverage, Slither fixes, CI | `chore: coverage, slither fixes and CI` |
| 17 | ⏳ | M8 | ARCHITECTURE.md, SECURITY.md | `docs: architecture and security model` |
| 18 | ⏳ | M8 | README, DEMO.md, DECK.md, final EVIDENCE.md | `docs: readme, demo script, deck outline, evidence` |

Stretch: add-to-existing-trove (`addCollWithSignature` / `withdrawMUSDWithSignature`).

## Funding needed for the [chain] checkpoints

Test WBTC / USDC come from Aave's permissionless Sepolia faucet inside the scripts. Only gas + Mezo BTC are needed:

| Wallet | Chain | Amount | Why |
|---|---|---|---|
| Solver | Sepolia | ~0.2 ETH | deploys + eth legs + finalize |
| Solver | Mezo testnet | ~0.25 BTC | ~0.05 BTC collateral per trove × 4 runs (M1, M4, M5, M6) + gas |
| User | Sepolia | ~0.05 ETH | supply/borrow on Aave (the solver script can top this up) |

The user's Mezo trove needs ≥ 1,800 MUSD net debt, so every test migration borrows ~1,850 USDC against ~0.05 WBTC.
