# Evidence (testnet transactions)

All transactions below are on **testnets** (Ethereum Sepolia, Mezo testnet). Nothing here touches mainnet.

## M0 — Environment check (2026-11-13)

`npm run env-check` (read-only) → **34/34 checks passed**. Full output: [m0-report.txt](m0-report.txt).

Key live values:

| Item | Value |
|---|---|
| Mezo testnet | chain id 31611, block gas limit 10,000,000 |
| Mezo Wormhole core | `0x268557122Ffd64c85750d630b716471118F323c8`, **Wormhole chain id 50**, message fee 0 |
| Sepolia Wormhole core | `0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78`, Wormhole chain id 10002, message fee 0 |
| Mezo OpenTrove EIP-712 domain | name `BorrowerOperationsSignatures`, version `1`, chainId 31611, verifyingContract `0xD757e3646AF370b15f32EB557F0F8380Df7D639e`; nonce getter `getNonce(address)` |
| Mezo params | minNetDebt 1,800 MUSD, borrowingRate 0.1%, gas compensation 200 MUSD, interest 100 bps (1%), 334 troves, TCR 245% (not in Recovery Mode) |
| Aave Sepolia | WBTC aToken `0x1804Bf30507dc2EB3bDEbbbdd859991EAeF6EefF` (permit supported), USDC variable debt token `0x36B5dE936eF1710E1d22EabE5231b28581a92ECc`, USDC variable APR ≈ 64% |

## Deployments (2026-11-13, testnet)

| Contract | Chain | Address |
|---|---|---|
| FerryMezo | Mezo testnet | [`0xa11169c243a471a865fcd0dd64db70427d013cc0`](https://explorer.test.mezo.org/address/0xa11169c243a471a865fcd0dd64db70427d013cc0) ([deploy tx](https://explorer.test.mezo.org/tx/0xc7ff65485e293c4a30ccbcd483d0a0ca8f7fbad644eac79e9f2cab9a88eb5c66)) |
| FerryEscrow (6 h timeout) | Sepolia | [`0x454ccd1b625599a51e58899a29ba57c2d5da6204`](https://sepolia.etherscan.io/address/0x454ccd1b625599a51e58899a29ba57c2d5da6204) |
| FerryEscrow (5 min timeout, refund demo) | Sepolia | [`0x23040744dd4067fbd868e1ce85a6adf7bfa77458`](https://sepolia.etherscan.io/address/0x23040744dd4067fbd868e1ce85a6adf7bfa77458) |
| VaaVerifier (M2 only) | Sepolia | [`0xa11169c243a471a865fcd0dd64db70427d013cc0`](https://sepolia.etherscan.io/address/0xa11169c243a471a865fcd0dd64db70427d013cc0) |

Solver: `0xd9dE0ACa02aA90590cEf2cbAe152abA49C0cB69b` (same key on both chains).

## M1 — Mezo leg alone (trove opened via signature)

Standalone script ready (`npm run m1 -w solver`), not yet run: the solver had 0.05 testnet BTC, which was spent on the M4 trove.
The same `openTroveWithSignature` path is proven through FerryMezo in M4 below (trove opened in the user's name, MUSD to the recipient).

## M2 — Wormhole message Mezo → Sepolia ✅

| Step | Tx |
|---|---|
| `FerryMezo.ping` on Mezo (Wormhole sequence 0) | [0x2166…85f1](https://explorer.test.mezo.org/tx/0x21665987c28e0883d1e5ce63270ee28cb82776d0e1b176e5445ea3dee3b985f1) |
| Signed VAA | [wormholescan 50/…a11169c2…/0](https://wormholescan.io/#/tx/50/000000000000000000000000a11169c243a471a865fcd0dd64db70427d013cc0/0?network=Testnet) |
| `VaaVerifier.verify` on Sepolia (`parseAndVerifyVM` + emitter check) | [0x787d…14ed2](https://sepolia.etherscan.io/tx/0x787d3d11fb2830cb24aeb8a8307804ad9d564dac5bd6b89fb2f5b633c0114ed2) |

## M3 — Aave leg alone ✅

Test user `0xf23fA113F5842713d68Ae063355F633D63dEEdbc`: supplied 0.045 WBTC, borrowed 1,850 USDC on Aave V3 Sepolia (HF 1.09).

| Step | Tx |
|---|---|
| Aave supply | [0xa5d5…3a14](https://sepolia.etherscan.io/tx/0xa5d5a86185a6e42fbb2a883548ef1c55ef64309c40b06bafe53ee6469a163a14) |
| Aave borrow | [0x8138…ce30](https://sepolia.etherscan.io/tx/0x813830194ec08077481a5522f1c609bcd399a34cf040c09a13f542d2cf29ce30) |
| **`FerryEscrow.executeEthLeg`**: repay 1,850.001353 USDC on behalf of the user, aToken permit, withdraw 0.045 WBTC into escrow | [0xad13…5580](https://sepolia.etherscan.io/tx/0xad13742e1d866537b204ad9ba9be39eddd2c6b144d8292d6a8a61cc36b425580) |

After: user's Aave debt 0, aWBTC 0; escrow status Pending.

## M4 — End-to-end migration + refund path

### Refund path ✅ (M3 intent, 5-minute escrow, no Mezo leg)

| Step | Tx |
|---|---|
| `FerryEscrow.refund` after timeout | [0x1c0d…b453](https://sepolia.etherscan.io/tx/0x1c0d8b5e203fb400f23f342883df55e5adac63cada773a8054f6b517303fb453) |

Escrowed 0.045 WBTC; solver had repaid 1,850.001353 USDC → solver received **0.03083335 WBTC** (exactly the repaid value at Aave's oracle, $60,000/BTC, rounded down); user received **0.01416665 WBTC** (their equity).

### Happy path (both legs ✅, finalize waiting on Wormhole testnet guardians)

Test user `0xB19b6DA5cC22863e65Ce856E98DC2CCF46Def277`: 0.045 WBTC supplied, 1,850 USDC borrowed on Aave.
Quote: move 0.045 WBTC → 0.045 BTC; repay ≤ 1,853.70 USDC → borrow 1,859.26 MUSD (solver fee 5.56, Mezo fee 1.86, gas comp 200);
trove debt 2,061.12 MUSD, ICR 151.1%, liquidation at $50,382.94/BTC.

| Step | Tx |
|---|---|
| Aave borrow (setup) | [0x9f47…b734b](https://sepolia.etherscan.io/tx/0x9f472a8c5a8e074ddbd10b7d0874ac1210f4c3b97f1acd90eb31de95883b734b) |
| **Sepolia `executeEthLeg`**: Aave debt repaid on behalf of user, aWBTC pulled by permit, 0.045 WBTC escrowed | [0xc788…2bda](https://sepolia.etherscan.io/tx/0xc78886338b4fece18596fe4f31048346be4581dae57d2bdd3730b99ea1d72bda) |
| **Mezo `executeMezoLeg`**: `openTroveWithSignature` → trove **active in the user's address** with 0.045 BTC; 1,859.26 MUSD to solver; Wormhole sequence 1 (gas 731,486) | [0xb891…725b](https://explorer.test.mezo.org/tx/0xb891512a1d564563a7045a9a81ebc843adc8ad3d661be010c4d83ebb602f725b) |
| Wormhole VAA (sequence 1) | [wormholescan](https://wormholescan.io/#/tx/50/000000000000000000000000a11169c243a471a865fcd0dd64db70427d013cc0/1?network=Testnet) — **pending** |
| Sepolia `finalize` | pending VAA |

**Wormhole testnet incident (2026-11-13):** the M2 ping (sequence 0, 06:55 UTC) was signed instantly, but no Mezo testnet
message from *any* emitter has been signed since (Wormholescan shows no chain-50 VAAs after 06:55). A probe ping
(sequence 2, [0x5d35…4c7b](https://explorer.test.mezo.org/tx/0x5d352e7421959a543f2b1145226f79f5ef58108365fe292b29a0da6508b74c7b))
is also unsigned. Ferry's design handles this: the WBTC stays safely in escrow; `npm run finalize -w solver -- 1`
completes it when guardians resume; otherwise the 6-hour timeout refund applies. As a hardening response, FerryMezo now
stores each proof and exposes a permissionless `republish(intentId)` for messages guardians missed (next deployment).

## M5 — Solver service

## M6 — Browser migration

## Corrections to the build brief

- The brief's addresses all verified on chain (no corrections).
- Mezo's signature digest is `keccak256(abi.encodePacked(typehash, abi.encode(assetAmount, debtAmount, borrower, recipient), nonce, deadline))`, which equals standard EIP-712 `hashStruct` because every field is a 32-byte word. Standard `signTypedData` works.
- Aave's oracle (WBTC $60,000) and Mezo's price feed (BTC ≈ $68,365) differ on testnet. Ferry uses each chain's own oracle for that chain's checks.
