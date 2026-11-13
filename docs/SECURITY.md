# Security model

> **Testnet prototype. Not audited.** Ethereum Sepolia + Mezo testnet only. Never use with real funds.

## Trust assumptions

| Party | Trusted for | Not trusted for |
|---|---|---|
| **User** | Nothing. All of their inputs are signed and checked on chain. | Cannot take WBTC without the solver being repaid; cannot reuse an intent (nonce). |
| **Solver** | Liveness only (running the Mezo leg after the Ethereum leg). | Cannot change amounts (every field is user-signed; Mezo verifies its own signature). Cannot take more than it repaid if it stalls (timeout split). |
| **Wormhole guardians** | Attesting that FerryMezo emitted the proof (13-of-19 on mainnet; testnet guardian set). | A missing attestation never loses funds; it triggers the timeout refund. |
| **Aave oracle** | Pricing the timeout refund split only. | Not used in the happy path. |
| **Mezo MUSD contracts** | Opening the trove exactly as the user signed. | Ferry reads the trove back and checks status, collateral and MUSD received. |
| **FerryMezo owner** | `ping` (test messages) and `rescue` of tokens sent to FerryMezo by mistake. FerryMezo holds no balance between transactions. | Cannot touch escrows, troves or proofs. |
| **FerryEscrow** | — | Has no owner, no admin, no upgrade path. |

## Risks to users

| Risk | Description | Mitigation |
|---|---|---|
| Debt asset changes | The user owes **MUSD** instead of USDC/USDT. | Stated in the UI before signing and in the docs. |
| Liquidation at 110% MCR | Trove can be liquidated if ICR < 110%. | Ferry requires ICR ≥ 120%, warns below 150%, shows the liquidation price. |
| Recovery Mode | If system TCR < 150%, troves below 150% can be liquidated and withdrawals are blocked. | `checkRecoveryMode` before every quote and every Mezo leg; in Recovery Mode new troves must be ≥ 150%. |
| Promotional rate | Mezo's 1% rate is promotional (1–5% range); it is fixed per trove at open. | Live rate read from `InterestRateManager`; disclosed. |
| Min debt | Net debt must be ≥ 1,800 MUSD; +200 MUSD gas compensation (returned on close). | Rejected up front. |
| Bridge risk | Escrow release depends on Wormhole. | No loss path: missing proof → timeout refund; `republish` for missed observations. |
| Solver liveness | Solver might stop after the Ethereum leg. | Permissionless `refund` after `timeout` (6 h; 5 min on the demo escrow). |
| One trove per address | Mezo constraint. | Detected before signing; stretch goal: `addCollWithSignature` / `withdrawMUSDWithSignature`. |

## Threats considered (and tests)

| Threat | Defence | Test |
|---|---|---|
| Forged / tampered intent | EIP-712 signature over every field (`SignatureChecker`, supports ERC-1271) | `test_ethLeg_revertsOnBadSignature`, `…OnTamperedIntent` |
| Intent replay | Per-user nonce + intentId status | `test_ethLeg_revertsOnReplay` |
| Expired intent | Deadline check | `test_ethLeg_revertsWhenExpired` |
| Repaying more than authorised | `debt ≤ maxDebtRepay`; exact debt read in the same tx | `test_ethLeg_revertsWhenDebtExceedsMax`, `…debtGrewButWithinMax` |
| Partially closed position | Require total Aave debt = 0 after repay | `test_ethLeg_revertsWhenPositionNotFullyClosed` |
| Permit griefing (front-run) | `try permit` + allowance check | `test_ethLeg_toleratesFrontRunPermit` |
| Fake proof | `parseAndVerifyVM` + emitter chain (50) + emitter address (FerryMezo) | `…revertsOnInvalidVaa`, `…WrongEmitterAddress`, `…WrongEmitterChain` |
| Proof for a different trove | Payload user / collateral ≥ promised / debt within [authorised + 200, +1% fee] | `test_finalize_revertsOnWrongPayload`, `test_proofMatches_bounds` |
| VAA replay | Consumed VAA hash + escrow status | `test_finalize_revertsOnVaaReplay`, `test_finalize_withRepublishedProof` |
| Wrong payload version (ping) | Version read before decoding | `test_finalize_rejectsPingVersion` |
| Refund steals equity | Solver share = value of `debtRepaid` at Aave oracle, rounded **down**, capped; one rounding step | `testFuzz_refundMaths`, `test_refund_*` |
| Reentrancy via token hooks | Transient-storage `nonReentrant` + checks-effects-interactions | `FerryReentrancy.t.sol` |
| Accounting drift | Invariant: escrow WBTC = Σ Pending escrows; conservation in = pending + released | `FerryEscrow.invariant.t.sol` (256 runs) |
| Mezo leg underfunded by solver | Mezo verifies `assetAmount == msg.value` in the user's signature; FerryMezo checks the trove's collateral | `test_mezoLeg_revertsOnWrongCollateralForSignature` |
| Front-running the Mezo leg | Signature recipient is FerryMezo; WBTC always goes to the escrow's recorded solver | design (see ARCHITECTURE.md) |

## Static analysis

Slither results and how each finding was handled are recorded below.

Slither runs in CI on every push (`.github/workflows/ci.yml`, job `slither`, fails on medium+). It could not run on the
author's Windows machine (an application-control policy blocks its native Python modules). Expected informational findings and
why they are accepted:

| Detector | Where | Why it is acceptable |
|---|---|---|
| `timestamp` | deadlines, `refundableAt` | Intended: deadlines and the timeout are coarse (minutes–hours); miner skew is irrelevant. |
| `reentrancy-benign` / `reentrancy-events` | `executeEthLeg`, `executeMezoLeg` | All entry points are `nonReentrant` (transient guard); external calls are to Aave, MUSD and Wormhole. Proven by `FerryReentrancy.t.sol`. |
| `unused-return` | `pool.withdraw`, `aToken.permit` (try) | The withdrawn amount is measured by balance difference; permit failure is tolerated by design and the allowance is checked. |
| `arbitrary-send-eth` / `low-level-calls` | `FerryMezo.rescue` | `onlyOwner`; FerryMezo holds no balance between transactions. |

## Known limitations (v1)

- Single collateral (WBTC) and single stablecoin debt per migration; the full aWBTC balance is moved.
- Solver is a single operator (roadmap: open network of bonded solvers).
- `MAX_MEZO_FEE_BPS` (1%) bounds the Mezo borrowing fee in the proof check; if Mezo governance raised the fee above 1%,
  `finalize` would reject and the timeout refund would apply.
- Testnet oracles differ between chains (Aave WBTC $60,000 vs Mezo BTC ≈ $68,000); each chain's own oracle is used for that chain's checks.
