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
| 12 | ⏳ | M1/M4/M5/M6 | Needs more Mezo BTC: run `m1`, redeploy (republish), `m4`, `m5`, browser migration, `finalize` **[chain]** | `docs(evidence): complete on-chain runs` |
| 13 | ⏳ | M6 | Deploy app (e.g. Vercel) + solver host → live testnet link | — |

Stretch: add-to-existing-trove (`addCollWithSignature` / `withdrawMUSDWithSignature`).
