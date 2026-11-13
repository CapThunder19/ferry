// Finalizes a pending migration once its VAA is available.
// Usage: npm run finalize -w solver -- <sequence> [escrowAddress] [ferryMezoAddress]
import type { Address } from "viem";
import { ferryEscrowAbi } from "@ferry/shared/ferryArtifacts";
import { decodeMezoProof } from "@ferry/shared/ferry";
import { makeCtx, sendFinalize } from "../src/legs.js";
import { loadDeployments, requireDeployment } from "../src/deployments.js";
import { MEZO_WORMHOLE_CHAIN_ID, fetchSignedVaa } from "../src/wormhole.js";
import { sepTx, step } from "../src/links.js";
import { slice } from "viem";

const [seqArg, escrowArg, mezoArg] = process.argv.slice(2);
if (!seqArg) throw new Error("usage: finalize <sequence> [escrow] [ferryMezo]");
const d = loadDeployments();
const escrow = (escrowArg ?? requireDeployment(d.sepolia?.ferryEscrow, "FerryEscrow")) as Address;
const ferryMezo = (mezoArg ?? requireDeployment(d.mezo?.ferryMezo, "FerryMezo")) as Address;
const ctx = makeCtx();

step(`Fetch VAA 50/${ferryMezo}/${seqArg}`);
const vaa = await fetchSignedVaa(MEZO_WORMHOLE_CHAIN_ID, ferryMezo, BigInt(seqArg), { log: (m) => console.log(`  ${m}`) });

// VAA body: header(6) + sigs(66 each) + timestamp(4) nonce(4) chain(2) emitter(32) seq(8) consistency(1) payload
const numSigs = Number(BigInt(slice(vaa, 5, 6)));
const payload = slice(vaa, 6 + 66 * numSigs + 51);
const proof = decodeMezoProof(payload);
console.log(`  proof: intent ${proof.intentId}, user ${proof.user}, coll ${proof.troveColl}, debt ${proof.troveDebt}`);

const e = await ctx.sep.readContract({ address: escrow, abi: ferryEscrowAbi, functionName: "getEscrow", args: [proof.intentId] });
if (e.status !== 1) throw new Error(`escrow status ${e.status} is not Pending`);

step("finalize");
const r = await sendFinalize(ctx, escrow, vaa);
console.log(`  ${sepTx(r.hash)}`);
