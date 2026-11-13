// Deploys FerryMezo (Mezo testnet), then VaaVerifier + FerryEscrow + a short-timeout FerryEscrow (Sepolia).
// Usage: npm run deploy -w solver [-- --only=mezo|sepolia]
import { mezo, sepolia } from "@ferry/shared/addresses";
import {
  ferryEscrowAbi,
  ferryEscrowBytecode,
  ferryMezoAbi,
  ferryMezoBytecode,
  vaaVerifierAbi,
  vaaVerifierBytecode,
} from "@ferry/shared/ferryArtifacts";
import { optionalEnv } from "../src/env.js";
import { makeCtx } from "../src/legs.js";
import { loadDeployments, requireDeployment, saveDeployments } from "../src/deployments.js";
import { MEZO_WORMHOLE_CHAIN_ID } from "../src/wormhole.js";
import { mezoAddr, sepAddr, step } from "../src/links.js";

const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const ctx = makeCtx();
const d = loadDeployments();

const CONSISTENCY_LEVEL = Number(optionalEnv("FERRY_CONSISTENCY_LEVEL") ?? 1); // 1 = finalized
const TIMEOUT = Number(optionalEnv("FERRY_TIMEOUT_SECONDS") ?? 6 * 3600);
const SHORT_TIMEOUT = Number(optionalEnv("FERRY_SHORT_TIMEOUT_SECONDS") ?? 300);

if (!only || only === "mezo") {
  step("Deploy FerryMezo on Mezo testnet");
  const hash = await ctx.mzW.deployContract({
    abi: ferryMezoAbi,
    bytecode: ferryMezoBytecode,
    args: [mezo.borrowerOperationsSignatures, mezo.troveManager, mezo.musd, mezo.wormholeCore, CONSISTENCY_LEVEL, ctx.mzW.account.address],
  });
  const r = await ctx.mz.waitForTransactionReceipt({ hash });
  d.mezo = { ferryMezo: r.contractAddress!, deployedAt: new Date().toISOString(), tx: hash };
  saveDeployments(d);
  console.log(`FerryMezo ${mezoAddr(r.contractAddress!)} (consistency level ${CONSISTENCY_LEVEL})`);
}

if (!only || only === "sepolia") {
  const ferryMezo = requireDeployment(d.mezo?.ferryMezo, "FerryMezo");
  step("Deploy VaaVerifier + FerryEscrow (x2) on Sepolia");
  const deploy = async (label: string, p: Parameters<typeof ctx.sepW.deployContract>[0]) => {
    const hash = await ctx.sepW.deployContract(p);
    const r = await ctx.sep.waitForTransactionReceipt({ hash });
    console.log(`${label} ${sepAddr(r.contractAddress!)}`);
    return r.contractAddress!;
  };
  const vaaVerifier = await deploy("VaaVerifier", {
    abi: vaaVerifierAbi,
    bytecode: vaaVerifierBytecode,
    args: [sepolia.wormholeCore, MEZO_WORMHOLE_CHAIN_ID, ferryMezo],
  } as never);
  const ferryEscrow = await deploy(`FerryEscrow (timeout ${TIMEOUT}s)`, {
    abi: ferryEscrowAbi,
    bytecode: ferryEscrowBytecode,
    args: [sepolia.aavePool, sepolia.wormholeCore, MEZO_WORMHOLE_CHAIN_ID, ferryMezo, BigInt(TIMEOUT)],
  } as never);
  const ferryEscrowShort = await deploy(`FerryEscrow short (timeout ${SHORT_TIMEOUT}s)`, {
    abi: ferryEscrowAbi,
    bytecode: ferryEscrowBytecode,
    args: [sepolia.aavePool, sepolia.wormholeCore, MEZO_WORMHOLE_CHAIN_ID, ferryMezo, BigInt(SHORT_TIMEOUT)],
  } as never);
  d.sepolia = {
    ferryEscrow,
    ferryEscrowTimeout: TIMEOUT,
    ferryEscrowShort,
    ferryEscrowShortTimeout: SHORT_TIMEOUT,
    vaaVerifier,
    deployedAt: new Date().toISOString(),
  };
  saveDeployments(d);
}

console.log("\nSaved shared/deployments.json");
