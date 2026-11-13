# Build Ferry: move a Bitcoin-backed loan from Aave to Mezo

You are a senior Solidity + TypeScript engineer. Build **Ferry**, a working product for the Mezo Buildathon (AKINDO, "Build with MUSD and MEZO"). Work through the milestones in order, verify each one on-chain before moving on, and keep a running evidence log of real transaction links.

---

## 1. What Ferry is (read this first)

**One-liner:** Ferry moves a user's Bitcoin-backed loan from Aave to Mezo's fixed-rate MUSD loan in one flow.

**The user today:** has WBTC supplied on Aave V3 and a variable-rate USDC/USDT loan against it. Variable rates swing a lot. Mezo offers BTC-backed loans (MUSD) at a fixed rate (currently 1% promotional, 1–5% range), but moving there takes ~5 manual steps across two chains and needs cash up front to repay Aave first.

**What Ferry does:** a **solver** fronts the money and runs both legs. The user only signs two messages and ends with a Mezo loan (a "trove") **in their own address**, with the same amount of BTC as collateral and MUSD debt roughly equal to their old Aave debt.

**End state:**
- User: Aave loan closed, Mezo trove open in their name (BTC collateral, MUSD debt, fixed rate).
- Solver: spent USDC on Ethereum + BTC on Mezo; received the user's WBTC on Ethereum + freshly minted MUSD on Mezo, plus a small fee.

**Target environment (testnets only):** Ethereum Sepolia + Mezo testnet. Never touch mainnet. Never commit private keys.

---

## 2. Verified facts and addresses (checked live on 2026-11-13; re-verify on chain at startup)

### Mezo testnet (chain id 31611)
- RPC: `https://rpc.test.mezo.org` · Explorer: `https://explorer.test.mezo.org` · Faucet: `https://faucet.test.mezo.org`
- Native gas/collateral token is **BTC (18 decimals)**, sent as `msg.value`. A BTC ERC-20 precompile also exists at `0x7b7C000000000000000000000000000000000000`.
- EVM supports Cancun opcodes (TSTORE/TLOAD, MCOPY, PUSH0 were tested and work). Use `evm_version = "cancun"`, Solidity 0.8.24+.
- **Block gas limit is 10,000,000.** Keep every transaction well under it.
- CREATE2 deterministic deployer `0x4e59b44847b379578588920cA78FbF26c0B4956C` exists.

MUSD system contracts (from `github.com/mezo-org/musd`, `solidity/artifacts/deployments/matsnet`):
| Contract | Address |
|---|---|
| BorrowerOperations | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |
| BorrowerOperationsSignatures | `0xD757e3646AF370b15f32EB557F0F8380Df7D639e` |
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| PriceFeed | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` |
| HintHelpers | `0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6` |
| SortedTroves | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` |
| InterestRateManager | `0xD4D6c36A592A2c5e86035A6bca1d57747a567f37` |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |

MUSD Wormhole NTT bridge, testnet (from `github.com/mezo-org/ntt-bridge`, `musd/testnet/deployment.json`):
| Chain | NTT Manager | Wormhole Transceiver | MUSD token |
|---|---|---|---|
| Mezo testnet (locking) | `0x20888B20e2F5F405d44261dA96467a1b1acE15be` | `0x3106675EDE4A64d70131247466FD8704A3d42123` | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| Sepolia (burning) | `0x1Ca5060BF142c58168aEdb974aABb020BC081A56` | `0x62d1286683507939c065C12f2d1E80cCa8CCD125` | `0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E` |

To find the **Wormhole core contract** on each chain, call the `wormhole()` getter on the WormholeTransceiver above (or check official Wormhole docs). Look up Mezo's **Wormhole chain id** in the official Wormhole SDK/docs; do not guess it. Sepolia's Wormhole chain id is 10002 (verify).

### Ethereum Sepolia (chain id 11155111)
- Aave V3 Pool: `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` (enable "testnet mode" on app.aave.com, use its Faucet tab for test tokens)
- Aave test reserves (from `Pool.getReservesList()`):
  - WBTC `0x29f2D40B0605204364af54EC677bD022dA425d03` (8 decimals)
  - USDC `0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8`
  - USDT `0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0`
- Get aToken / variableDebtToken addresses with `Pool.getReserveData(asset)`. Get prices from Aave's oracle (`PoolAddressesProvider.getPriceOracle()` → `getAssetPrice`).
- Only use Aave's own test assets. Circle's Sepolia USDC is a different token and is not listed on Aave Sepolia.

---

## 3. Mezo rules you MUST respect (read from the MUSD source code)

Read `BorrowerOperations.sol`, `BorrowerOperationsSignatures.sol`, `TroveManager.sol` and `dependencies/LiquityBase.sol` in `mezo-org/musd` before writing code. Key facts:

1. **Opening a trove for someone else:** `BorrowerOperationsSignatures.openTroveWithSignature(uint256 _debtAmount, address _upperHint, address _lowerHint, address _borrower, address _recipient, bytes _signature, uint256 _deadline) payable`.
   - Anyone may call it and supply the BTC collateral as `msg.value`.
   - The borrower signs EIP-712 typed data: `OpenTrove(uint256 assetAmount,uint256 debtAmount,address borrower,address recipient,uint256 nonce,uint256 deadline)`, where `assetAmount` must equal `msg.value`.
   - Newly minted MUSD goes to `_recipient`.
   - Read the contract for the EIP-712 domain (name, version, chainId, verifyingContract) and the nonce getter. Do not guess them.
2. **Minimum net debt:** `minNetDebt` = 1,800 MUSD. A trove's net debt can never go below this without closing it.
3. **Gas compensation:** an extra 200 MUSD is added to every trove's debt (returned on close). Trove debt = `debtAmount` + borrowing fee + 200.
4. **Borrowing fee:** `borrowingRate` = 0.1%, added to debt.
5. **Ratios:** MCR = 110% (liquidation below this). CCR = 150%: if the whole system's TCR falls below 150% it enters **Recovery Mode**, where new troves need ICR ≥ 150% and collateral withdrawals are blocked. Check `TroveManager.checkRecoveryMode(price)` before every Mezo leg.
6. **maxBorrowingCapacity** is fixed at open as `coll * price / 1.1`.
7. **One trove per address.** If the user already has an active trove, `openTroveWithSignature` reverts. Detect this up front and show a clear message. (Stretch goal: support "add to existing trove" via `addCollWithSignature` / `withdrawMUSDWithSignature`.)
8. **Hints:** compute `upperHint`/`lowerHint` with `HintHelpers.getApproxHint` + `SortedTroves.findInsertPosition` right before sending. Bad hints cost a lot of gas (300+ troves on testnet).
9. **Interest:** fixed per trove from `InterestRateManager.interestRate()` (basis points; 100 = 1% on testnet at time of check).
10. Mezo price reads go through a precompile. **Foundry fork tests against Mezo may fail on precompiles**; other teams solved this by etching shims at the precompile address or by testing directly on the live testnet. Plan for that.

---

## 4. Architecture

```
ferry/
  contracts/            Foundry project
    src/ethereum/FerryEscrow.sol      Sepolia: Aave leg + escrow + VAA finalize + timeout
    src/mezo/FerryMezo.sol            Mezo testnet: opens trove via signature, pays solver, emits Wormhole message
    src/libraries/FerryTypes.sol      shared structs, EIP-712 typehashes, payload encoding
    test/                             unit, fuzz, invariant tests + fork tests
    script/                           deploy + end-to-end demo scripts
  solver/               TypeScript (viem) service that executes migrations
  app/                  Next.js + wagmi + viem frontend
  docs/                 ARCHITECTURE.md, SECURITY.md, EVIDENCE.md (tx links), DEMO.md
  README.md
```

### 4.1 The migration intent (signed by the user on Sepolia, EIP-712, domain = FerryEscrow)
```
MigrationIntent {
  address user;
  address collateralAsset;     // WBTC on Sepolia
  uint256 collateralAmount;    // WBTC (8 dec) to move; v1 = full balance of the aToken
  address debtAsset;           // USDC or USDT on Sepolia
  uint256 maxDebtRepay;        // max debt the solver repays on Aave
  uint256 mezoCollateral;      // BTC (18 dec) the trove must receive, = collateralAmount * 1e10 minus solver fee in BTC (or 1:1, fee taken in MUSD)
  uint256 mezoDebtAmount;      // MUSD debtAmount the user authorises on Mezo
  uint256 solverFeeBps;        // e.g. 30 = 0.30%
  uint256 nonce;
  uint256 deadline;
}
intentId = EIP-712 hash of the intent
```
The user also signs:
- An **EIP-2612 permit** for the aToken (Aave aTokens support permit) so FerryEscrow can pull the aTokens.
- The **Mezo `OpenTrove` signature** with `recipient = FerryMezo` (so FerryMezo can forward MUSD to whichever solver executes), `assetAmount = mezoCollateral`, `debtAmount = mezoDebtAmount`.

UX note: MetaMask requires the EIP-712 domain chainId to match the connected chain. The app must sign the Sepolia messages while on Sepolia, then switch the wallet to Mezo testnet (`wallet_addEthereumChain` / `wallet_switchEthereumChain`) for the Mezo signature. The user needs **no gas on Mezo**.

### 4.2 Flow (Ethereum leg first, protected by escrow)
1. **Frontend → solver API:** POST the intent, intent signature, aToken permit and Mezo signature.
2. **Solver validates off-chain:** signatures, deadlines, Aave position (`getUserAccountData`, debt token balances), Mezo not in Recovery Mode, user has no existing trove, resulting Mezo ICR ≥ policy, enough BTC on Mezo / USDC on Sepolia. Simulate both legs (`eth_call`).
3. **Sepolia, `FerryEscrow.executeEthLeg(intent, sigs)`** (called by the solver, atomic):
   - verify intent signature, nonce, deadline;
   - pull `debtRepay` from the solver and call `Pool.repay(debtAsset, amount, 2, user)` (repay on behalf of the user; use `type(uint256).max` semantics carefully, the actual debt can grow every block);
   - use the aToken permit, transfer the user's aTokens to the escrow, and call `Pool.withdraw(collateralAsset, type(uint256).max, address(this))`;
   - store the escrow record `{intentId, user, solver, wbtcAmount, debtRepaid, startedAt, status=Pending}` and emit `EthLegExecuted`.
   - Revert everything if the user's position would not be fully closed, or if the repayment exceeds `maxDebtRepay`.
4. **Mezo, `FerryMezo.executeMezoLeg(intentId, user, mezoCollateral, mezoDebtAmount, hints, mezoSig, deadline)` payable** (called by the solver with `msg.value = mezoCollateral` + Wormhole message fee):
   - call `openTroveWithSignature{value: mezoCollateral}(mezoDebtAmount, upperHint, lowerHint, user, address(this), mezoSig, deadline)`;
   - read the trove back from TroveManager to confirm it's active with the expected collateral and debt;
   - transfer the received MUSD to `msg.sender` (the solver);
   - publish a Wormhole message: `payload = abi.encode(version, intentId, user, troveColl, troveDebt, solver)` via the core contract's `publishMessage`;
   - emit `MezoLegExecuted(intentId, sequence)`.
5. **Solver fetches the signed VAA** from the Wormhole testnet API (`https://api.testnet.wormholescan.io/api/v1/vaas/{chainId}/{emitter}/{sequence}`, verify the exact endpoint in Wormhole docs).
6. **Sepolia, `FerryEscrow.finalize(vaa)`:** verify the VAA with the Wormhole core contract (`parseAndVerifyVM`), check emitter chain + emitter address (= FerryMezo), check the payload matches the stored escrow (`user`, `troveColl >= intent.mezoCollateral`, `troveDebt` consistent with `mezoDebtAmount`), mark consumed (replay protection), release the WBTC to the solver, status = Completed.
7. **Timeout path, `FerryEscrow.refund(intentId)`** after `TIMEOUT` (e.g. 6 hours; configurable, short for the demo): the solver receives WBTC worth exactly `debtRepaid` (priced with Aave's oracle, rounded in the user's favour), the **user receives the rest**, status = Refunded. Nobody can take the user's equity.

Why Ethereum-first: if the Mezo leg ran first, a user could grief the solver by closing their Aave loan themselves after the solver had funded the Mezo trove. With the escrow, both sides are protected.

### 4.3 Economics and checks
- Mezo trove debt ≈ Aave debt × (1 + solverFee) + 0.1% Mezo fee + 200 MUSD gas compensation. Show every part in the UI.
- Reject migrations where Mezo net debt < 1,800 MUSD.
- Hard minimum resulting ICR 120%; warn below 150% (Recovery Mode threshold). Show liquidation price.
- Collateral conversion: WBTC (8 dec) → BTC (18 dec), multiply by 1e10.
- The user's debt changes from USDC/USDT to **MUSD**. Say this clearly in the UI and docs.

### 4.4 Solver service (`solver/`)
- TypeScript + viem. Two wallets from `.env` (`SOLVER_SEPOLIA_KEY`, `SOLVER_MEZO_KEY`, can be the same key). Ship `.env.example`, never real keys.
- HTTP API: `POST /intents`, `GET /intents/:id` (status, both tx hashes, VAA, timestamps).
- State machine per intent: `Received → Validated → EthLegDone → MezoLegDone → VaaFetched → Completed` (or `Failed` / `Refunded`). Persist to SQLite or a JSON file. Idempotent and restart-safe.
- Retries with backoff on RPC errors. Note that the public Mezo RPC sometimes lags: pin reads to the latest block.
- Inventory check before accepting an intent (BTC on Mezo, USDC/USDT on Sepolia).

### 4.5 Frontend (`app/`)
- Next.js + wagmi + viem. Networks: Sepolia and Mezo testnet (add the custom chain config).
- Pages:
  1. **Home:** the pitch, a live rate comparison (Aave variable borrow APR from `getReserveData().currentVariableBorrowRate` vs Mezo `InterestRateManager.interestRate()`).
  2. **Migrate:** read the user's Aave position, show before/after (collateral, debt, rate, yearly savings in $, Mezo ICR, liquidation price, all fees), warnings (MUSD debt, min 1,800, existing trove, Recovery Mode), then the guided signing: Sepolia intent + permit → switch network → Mezo signature → submit.
  3. **Status:** a step tracker with explorer links for both chains and the Wormhole VAA (wormholescan).
  4. **Docs/Risks:** a plain-language explanation and the risk table.
- Use real on-chain data everywhere. Never hardcode numbers in the UI.
- Clean, simple design. Mobile friendly.

---

## 5. Milestones (do them in order, prove each on-chain)

**M0 Environment check.** Script that confirms: both RPCs reachable, chain ids, all addresses in section 2 have code, Aave Sepolia reserves list, Mezo not in Recovery Mode, Wormhole core addresses found, Mezo Wormhole chain id found. Print a report.

**M1 Mezo leg alone.** With a test user key: sign `OpenTrove` and have a second key call `openTroveWithSignature` with BTC. Confirm the trove opened in the user's name and the MUSD went to the recipient. Save the tx link to `docs/EVIDENCE.md`.

**M2 Wormhole message.** Deploy FerryMezo, publish a message, fetch the VAA, verify it on Sepolia in a small verifier contract. Evidence links.

**M3 Aave leg alone.** Create a test Aave position (supply WBTC, borrow USDC) for the test user. Deploy FerryEscrow; execute repay-on-behalf + permit + withdraw into the escrow. Evidence links.

**M4 Full end-to-end script.** One script runs M3 → M1 (through FerryMezo) → VAA → `finalize`. Also script the **timeout/refund path**. Evidence links for both.

**M5 Solver service** running the same flow from an HTTP request.

**M6 Frontend** wired to the solver, full migration from the browser.

**M7 Tests.** Foundry unit + fuzz tests for: intent signature checks, nonce/replay, deadline, partial or excess repay, VAA replay, wrong emitter, wrong payload, timeout split maths (user never loses equity), reentrancy. An invariant: the escrow's WBTC always equals the sum of pending escrows. Aim for high coverage. Run Slither and fix findings.

**M8 Docs + submission material.**
- `README.md`: what it is, why, how to run, addresses, demo links.
- `docs/ARCHITECTURE.md` with a sequence diagram (Mermaid).
- `docs/SECURITY.md`: trust assumptions and risks (bridge risk, solver liveness, MUSD debt instead of USDC, promotional 1% rate, Recovery Mode, liquidation at 110%, min debt 1,800, testnet only, not audited).
- `docs/EVIDENCE.md`: every real testnet tx, grouped by milestone.
- `docs/DEMO.md`: a 2-minute video script (problem → live migration → result → why Mezo wins).
- A short pitch deck outline in Markdown (problem, market size, solution, demo, how it uses Mezo, business model = solver fee, risks, roadmap).

---

## 6. Hackathon context (so you optimise for the right things)

Judges (Mezo core team) score: **Mezo integration 30%** (depth matters more than surface usage), **product & business viability 30%**, **technical implementation 20%** (code quality, security, deployable rather than demo-only), **UX 10%**, **submission materials 10%**. They said they prefer projects that **extend existing Mezo products** and **plug into existing DeFi infrastructure**, and in Wave 2 they rank complete, ready projects higher. They check real on-chain evidence; testnet transactions must be labelled as testnet.

Submission needs: a live testnet link, a public GitHub repo, a deck, a 2-minute pitch video, and the AKINDO form (name, 3–5 word category, one-sentence TL;DR, how it works, target users, tech stack, track = Track 1 and Track 2, chain = Mezo testnet + Sepolia, status = new project, readiness = testnet, next 3 milestones, team).

Suggested roadmap for the deck: (1) Morpho Blue (Base) and Aave on Base as sources, (2) open solver network with bonded solvers, (3) mainnet launch with deposit caps after an audit.

---

## 7. Working rules

- Re-verify every address and function signature on-chain or in the official source before using it. If something in this brief turns out wrong, trust the chain and the source code, and note the correction in `docs/EVIDENCE.md`.
- Testnets only. Keys only in `.env` (git-ignored). Provide `.env.example`.
- Small, reviewed commits with clear messages.
- When blocked (faucet empty, RPC down, missing chain id), say exactly what's missing and continue with the parts that aren't blocked.
- At the end of each milestone, print a short status: what works, the evidence links, what's next.
