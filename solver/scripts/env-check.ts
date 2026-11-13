// M0: environment check. Read-only; needs no keys.
import { formatUnits, getAddress, type Address } from "viem";
import { mezo, sepolia, MEZO_CHAIN_ID, SEPOLIA_CHAIN_ID } from "@ferry/shared/addresses";
import * as abi from "@ferry/shared/abis";
import { mezoPublic, sepoliaPublic } from "../src/clients.js";

const results: { check: string; ok: boolean; detail: string }[] = [];

async function guard(check: string, fn: () => Promise<string | void>) {
  try {
    results.push({ check, ok: true, detail: (await fn()) ?? "" });
  } catch (e) {
    results.push({ check, ok: false, detail: (e as Error).message.split("\n")[0] });
  }
}

const sep = sepoliaPublic();
const mz = mezoPublic();
type Client = typeof sep;
const clientFor = (c: unknown) => c as Client;

async function hasCode(client: Client, label: string, addr: Address) {
  await guard(`code: ${label}`, async () => {
    const code = await client.getCode({ address: addr });
    if (!code || code === "0x") throw new Error(`no code at ${addr}`);
    return `${addr} (${(code.length - 2) / 2} bytes)`;
  });
}

await guard("Sepolia RPC chain id", async () => {
  const id = await sep.getChainId();
  if (id !== SEPOLIA_CHAIN_ID) throw new Error(`got ${id}`);
  return `${id}, block ${await sep.getBlockNumber()}`;
});
await guard("Mezo RPC chain id", async () => {
  const id = await mz.getChainId();
  if (id !== MEZO_CHAIN_ID) throw new Error(`got ${id}`);
  const block = await mz.getBlock();
  return `${id}, block ${block.number}, gas limit ${block.gasLimit}`;
});

for (const [k, v] of Object.entries(mezo)) if (k !== "btcErc20") await hasCode(clientFor(mz), `mezo.${k}`, v);
for (const [k, v] of Object.entries(sepolia)) await hasCode(sep, `sepolia.${k}`, v);

await guard("Aave reserves include WBTC/USDC/USDT", async () => {
  const list = (await sep.readContract({ address: sepolia.aavePool, abi: abi.aavePoolAbi, functionName: "getReservesList" })).map((a) => getAddress(a));
  for (const t of [sepolia.wbtc, sepolia.usdc, sepolia.usdt]) if (!list.includes(getAddress(t))) throw new Error(`${t} not listed`);
  return `${list.length} reserves`;
});

for (const [name, asset] of [["WBTC", sepolia.wbtc], ["USDC", sepolia.usdc], ["USDT", sepolia.usdt]] as const) {
  await guard(`Aave ${name} reserve`, async () => {
    const r = await sep.readContract({ address: sepolia.aavePool, abi: abi.aavePoolAbi, functionName: "getReserveData", args: [asset] });
    const dec = await sep.readContract({ address: asset, abi: abi.erc20Abi, functionName: "decimals" });
    const apr = Number(formatUnits(r.currentVariableBorrowRate, 27)) * 100;
    return `decimals ${dec}, aToken ${r.aTokenAddress}, vDebt ${r.variableDebtTokenAddress}, variable APR ${apr.toFixed(2)}%`;
  });
}

await guard("Aave oracle prices", async () => {
  const provider = await sep.readContract({ address: sepolia.aavePool, abi: abi.aavePoolAbi, functionName: "ADDRESSES_PROVIDER" });
  const oracle = await sep.readContract({ address: provider, abi: abi.aaveAddressesProviderAbi, functionName: "getPriceOracle" });
  const [w, u] = await Promise.all(
    [sepolia.wbtc, sepolia.usdc].map((a) => sep.readContract({ address: oracle, abi: abi.aaveOracleAbi, functionName: "getAssetPrice", args: [a] })),
  );
  return `oracle ${oracle}, WBTC $${formatUnits(w, 8)}, USDC $${formatUnits(u, 8)}`;
});

await guard("WBTC aToken permit (EIP-2612)", async () => {
  const r = await sep.readContract({ address: sepolia.aavePool, abi: abi.aavePoolAbi, functionName: "getReserveData", args: [sepolia.wbtc] });
  const ds = await sep.readContract({ address: r.aTokenAddress, abi: abi.erc20Abi, functionName: "DOMAIN_SEPARATOR" });
  const name = await sep.readContract({ address: r.aTokenAddress, abi: abi.erc20Abi, functionName: "name" });
  return `name "${name}", DOMAIN_SEPARATOR ${ds}`;
});

let price = 0n;
await guard("Mezo BTC price (PriceFeed.fetchPrice)", async () => {
  price = await mz.readContract({ address: mezo.priceFeed, abi: abi.priceFeedAbi, functionName: "fetchPrice" });
  return `$${formatUnits(price, 18)}`;
});
await guard("Mezo not in Recovery Mode", async () => {
  const rm = await mz.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "checkRecoveryMode", args: [price] });
  const tcr = await mz.readContract({ address: mezo.troveManager, abi: abi.troveManagerAbi, functionName: "getTCR", args: [price] });
  const pct = Number(formatUnits(tcr * 100n, 18)).toFixed(1);
  if (rm) throw new Error(`RECOVERY MODE (TCR ${pct}%)`);
  return `TCR ${pct}%`;
});
await guard("Mezo MUSD parameters", async () => {
  const [minNetDebt, rate, gasComp, ir, size] = await Promise.all([
    mz.readContract({ address: mezo.borrowerOperations, abi: abi.borrowerOperationsAbi, functionName: "minNetDebt" }),
    mz.readContract({ address: mezo.borrowerOperations, abi: abi.borrowerOperationsAbi, functionName: "borrowingRate" }),
    mz.readContract({ address: mezo.borrowerOperations, abi: abi.borrowerOperationsAbi, functionName: "MUSD_GAS_COMPENSATION" }),
    mz.readContract({ address: mezo.interestRateManager, abi: abi.interestRateManagerAbi, functionName: "interestRate" }),
    mz.readContract({ address: mezo.sortedTroves, abi: abi.sortedTrovesAbi, functionName: "getSize" }),
  ]);
  return `minNetDebt ${formatUnits(minNetDebt, 18)} MUSD, borrowingRate ${Number(formatUnits(rate, 18)) * 100}%, gasComp ${formatUnits(gasComp, 18)} MUSD, interest ${ir} bps, ${size} troves`;
});
await guard("Mezo OpenTrove EIP-712 domain", async () => {
  const d = await mz.readContract({ address: mezo.borrowerOperationsSignatures, abi: abi.borrowerOperationsSignaturesAbi, functionName: "eip712Domain" });
  return `name "${d[1]}", version "${d[2]}", chainId ${d[3]}, verifyingContract ${d[4]}`;
});

for (const [label, client, transceiver, expected] of [
  ["Mezo", clientFor(mz), mezo.wormholeTransceiver, mezo.wormholeCore],
  ["Sepolia", sep, sepolia.wormholeTransceiver, sepolia.wormholeCore],
] as const) {
  await guard(`${label} Wormhole core + chain id`, async () => {
    const core = await client.readContract({ address: transceiver, abi: abi.wormholeTransceiverAbi, functionName: "wormhole" });
    if (getAddress(core) !== getAddress(expected)) throw new Error(`transceiver says ${core}, shared/addresses.ts says ${expected}`);
    const [whChain, fee] = await Promise.all([
      client.readContract({ address: core, abi: abi.wormholeAbi, functionName: "chainId" }),
      client.readContract({ address: core, abi: abi.wormholeAbi, functionName: "messageFee" }),
    ]);
    return `core ${core}, wormhole chain id ${whChain}, message fee ${fee}`;
  });
}

const pad = Math.max(...results.map((r) => r.check.length));
console.log(`\nFerry M0 environment check — ${new Date().toISOString()}\n`);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check.padEnd(pad)}  ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
