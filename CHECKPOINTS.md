# Ferry build checkpoints (full scope of FERRY_BUILD_PROMPT.md)

**[chain]** = needs funded testnet keys; tx links go into `docs/EVIDENCE.md`.

| CP | Status | Milestone | What | Commit message |
|---|---|---|---|---|
| 01 | ✅ | — | Repo scaffold | `chore: scaffold ferry monorepo` |
| 02 | ✅ | — | Hardhat 3 + npm workspaces + interfaces + shared addresses/ABIs | `chore: hardhat 3 workspace, contract interfaces and shared config` |
| 03 | ✅ | M0 | Environment check (34/34) | `feat(m0): environment check script and report` |
| 04 | ✅ | — | FerryEscrow, FerryMezo, FerryTypes, VaaVerifier + unit/fuzz tests | `feat(contracts): FerryEscrow, FerryMezo, FerryTypes with unit and fuzz tests` |
| 05 | ✅ | M7 | Invariant + reentrancy tests | `test(contracts): invariant and reentrancy suites` |
| 06 | ✅ | M1–M4 | Deploy + milestone scripts | `feat(solver): deploy and m1-m4 milestone scripts` |
| 07 | ✅ | M2–M4 | Deployed; M2 ✅, M3 ✅, refund ✅, M4 both legs ✅ (finalize waits on Wormhole testnet) **[chain]** | `feat(m2-m4): testnet deployments and on-chain evidence` |
| 08 | ✅ | — | FerryMezo `republish` (guardian-miss recovery) + test | `feat(contracts): republishable mezo proofs` |
| 09 | ✅ | M5 | Solver service: store, validation, state machine, HTTP API, M5 script | `feat(m5): solver service with http api and restart-safe state machine` |
| 10 | ✅ | M6 | Next.js app: home/rates, migrate, signing, status, docs/risks | `feat(m6): ferry web app` |
| 11 | ✅ | M7/M8 | CI (tests, typecheck, build, Slither) + docs | `docs: architecture, security, demo, deck, readme; ci with slither` |
| 12 | ✅ | — | v2 contracts deployed (with `republish`) | `feat: deploy v2 contracts with republishable proofs` |
| 13 | ✅ | M5 | Parallel intents, per-chain tx mutex, auto-republish, faucet top-up | `feat(solver): parallel intents, auto-republish and faucet top-up` |
| 14 | ✅ | M6 | USDT support (detect debt asset), status page republish links | `feat(app): usdt support and republish status` |
| 15 | ✅ | M8 | Hosting: solver Dockerfile, Render blueprint, DEPLOY.md | `chore: hosting config for solver and app` |
| 16 | ⏳ | M6 | Browser migration with MetaMask (uses the 0.05 BTC) **[chain]** | `docs(evidence): browser migration` |
| 17 | ⏳ | M6 | Host app + solver → live link in README | — |
| 18 | ⏳ | M1/M4 | `m1` (needs ~0.04 more BTC), `finalize` once Wormhole testnet signs again **[chain]** | `docs(evidence): complete on-chain runs` |

Stretch: add-to-existing-trove (`addCollWithSignature` / `withdrawMUSDWithSignature`).
