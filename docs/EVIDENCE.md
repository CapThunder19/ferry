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

## M1 — Mezo leg alone (trove opened via signature)

## M2 — Wormhole message Mezo → Sepolia

## M3 — Aave leg alone

## M4 — End-to-end migration + refund path

## M5 — Solver service

## M6 — Browser migration

## Corrections to the build brief

- The brief's addresses all verified on chain (no corrections).
- Mezo's signature digest is `keccak256(abi.encodePacked(typehash, abi.encode(assetAmount, debtAmount, borrower, recipient), nonce, deadline))`, which equals standard EIP-712 `hashStruct` because every field is a 32-byte word. Standard `signTypedData` works.
- Aave's oracle (WBTC $60,000) and Mezo's price feed (BTC ≈ $68,365) differ on testnet. Ferry uses each chain's own oracle for that chain's checks.
