import { config as loadEnv } from "dotenv";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

// Keys live in the repo-root .env (git-ignored). Testnets only.
loadEnv({ path: "../.env", quiet: true });

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.30",
        settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
      },
    },
  },
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SOLVER_SEPOLIA_KEY")],
    },
    mezo: {
      type: "http",
      chainType: "generic",
      chainId: 31611,
      url: configVariable("MEZO_RPC_URL"),
      accounts: [configVariable("SOLVER_MEZO_KEY")],
    },
  },
});
