// M2: FerryMezo publishes a Wormhole message, we fetch the signed VAA and verify it on Sepolia.
import { keccak256, parseEventLogs, toHex } from "viem";
import { ferryMezoAbi, vaaVerifierAbi } from "@ferry/shared/ferryArtifacts";
import { makeCtx } from "../src/legs.js";
import { loadDeployments, requireDeployment } from "../src/deployments.js";
import { MEZO_WORMHOLE_CHAIN_ID, fetchSignedVaa, wormholescanLink } from "../src/wormhole.js";
import { mezoTx, sepTx, step } from "../src/links.js";

const ctx = makeCtx();
const d = loadDeployments();
const ferryMezo = requireDeployment(d.mezo?.ferryMezo, "FerryMezo");
const verifier = requireDeployment(d.sepolia?.vaaVerifier, "VaaVerifier");

step("FerryMezo.ping on Mezo");
const tag = keccak256(toHex(`ferry-m2-${Date.now()}`));
const { request } = await ctx.mz.simulateContract({ account: ctx.mzW.account, address: ferryMezo, abi: ferryMezoAbi, functionName: "ping", args: [tag] });
const hash = await ctx.mzW.writeContract(request);
const receipt = await ctx.mz.waitForTransactionReceipt({ hash });
const [ev] = parseEventLogs({ abi: ferryMezoAbi, logs: receipt.logs, eventName: "Ping" });
console.log(`tx ${mezoTx(hash)} — sequence ${ev.args.sequence}`);
console.log(`wormholescan ${wormholescanLink(MEZO_WORMHOLE_CHAIN_ID, ferryMezo, ev.args.sequence)}`);

step("Wait for guardians to sign the VAA");
const vaa = await fetchSignedVaa(MEZO_WORMHOLE_CHAIN_ID, ferryMezo, ev.args.sequence, { log: (m) => console.log(`  ${m}`) });
console.log(`VAA ${vaa.length / 2 - 1} bytes`);

step("VaaVerifier.verify on Sepolia");
const sim = await ctx.sep.simulateContract({ account: ctx.sepW.account, address: verifier, abi: vaaVerifierAbi, functionName: "verify", args: [vaa] });
const vhash = await ctx.sepW.writeContract(sim.request);
const vr = await ctx.sep.waitForTransactionReceipt({ hash: vhash });
console.log(`tx ${sepTx(vhash)} — ${vr.status}`);
if (vr.status !== "success") throw new Error("verify failed");
console.log("\nM2 OK");
