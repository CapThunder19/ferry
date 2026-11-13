// Shows the solver and user balances needed for the on-chain milestones.
import { formatEther, formatUnits } from "viem";
import { mezo, sepolia } from "@ferry/shared/addresses";
import * as abi from "@ferry/shared/abis";
import { account, mezoPublic, sepoliaPublic } from "../src/clients.js";

const sep = sepoliaPublic();
const mz = mezoPublic();
const solver = account("SOLVER_SEPOLIA_KEY").address;
const solverMezo = account("SOLVER_MEZO_KEY").address;
const user = account("USER_KEY").address;

const erc = (t: `0x${string}`, who: `0x${string}`) => sep.readContract({ address: t, abi: abi.erc20Abi, functionName: "balanceOf", args: [who] });

console.log(`Solver (Sepolia) ${solver}`);
console.log(`  ETH  ${formatEther(await sep.getBalance({ address: solver }))}`);
console.log(`  USDC ${formatUnits(await erc(sepolia.usdc, solver), 6)}   WBTC ${formatUnits(await erc(sepolia.wbtc, solver), 8)}`);
console.log(`Solver (Mezo)    ${solverMezo}`);
console.log(`  BTC  ${formatEther(await mz.getBalance({ address: solverMezo }))}`);
console.log(`  MUSD ${formatEther(await mz.readContract({ address: mezo.musd, abi: abi.erc20Abi, functionName: "balanceOf", args: [solverMezo] }))}`);
console.log(`User (Sepolia)   ${user}`);
console.log(`  ETH  ${formatEther(await sep.getBalance({ address: user }))}`);
