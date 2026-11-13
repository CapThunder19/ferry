# Ferry

**Move a Bitcoin-backed loan from Aave to Mezo's fixed-rate MUSD loan in one flow.**

You have WBTC on Aave with a variable-rate stablecoin loan against it. Ferry's solver repays the Aave loan,
moves the collateral, and opens a fixed-rate MUSD trove on Mezo in your own address. You only sign messages.

> Testnet prototype (Ethereum Sepolia + Mezo testnet) built for the Mezo Buildathon. Not audited.

## Repo layout

| Folder | What |
|---|---|
| `contracts/` | Foundry: `FerryEscrow` (Sepolia), `FerryMezo` (Mezo testnet), shared types |
| `solver/` | TypeScript (viem) service + scripts that run migrations |
| `app/` | Next.js frontend |
| `docs/` | Architecture, risks, evidence (testnet tx links), demo script |

Setup and run instructions are added as the build progresses (see `CHECKPOINTS.md`).
