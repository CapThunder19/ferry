// Testnet addresses. Verified on chain by `npm run env-check` (solver/). Testnets only.
import type { Address } from "viem";

export const SEPOLIA_CHAIN_ID = 11155111;
export const MEZO_CHAIN_ID = 31611;

export const mezo = {
  borrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
  borrowerOperationsSignatures: "0xD757e3646AF370b15f32EB557F0F8380Df7D639e",
  troveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
  priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
  hintHelpers: "0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6",
  sortedTroves: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA",
  interestRateManager: "0xD4D6c36A592A2c5e86035A6bca1d57747a567f37",
  musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  btcErc20: "0x7b7C000000000000000000000000000000000000",
  nttManager: "0x20888B20e2F5F405d44261dA96467a1b1acE15be",
  wormholeTransceiver: "0x3106675EDE4A64d70131247466FD8704A3d42123",
  // From WormholeTransceiver.wormhole() on 2026-11-13
  wormholeCore: "0x268557122Ffd64c85750d630b716471118F323c8",
} as const satisfies Record<string, Address>;

export const sepolia = {
  aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
  // Aave V3 testnet faucet: permissionless mint(token, to, amount) (isPermissioned() == false on 2026-11-13)
  aaveFaucet: "0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D",
  wbtc: "0x29f2D40B0605204364af54EC677bD022dA425d03",
  usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
  usdt: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
  nttManager: "0x1Ca5060BF142c58168aEdb974aABb020BC081A56",
  wormholeTransceiver: "0x62d1286683507939c065C12f2d1E80cCa8CCD125",
  musd: "0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E",
  // From WormholeTransceiver.wormhole() on 2026-11-13
  wormholeCore: "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78",
} as const satisfies Record<string, Address>;

export const WORMHOLESCAN_API = "https://api.testnet.wormholescan.io/api/v1";
export const WORMHOLESCAN_UI = "https://wormholescan.io/#/tx";
export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";
export const MEZO_EXPLORER = "https://explorer.test.mezo.org";
