"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfig, useConnection } from "wagmi";
import { signTypedData, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { parseSignature, parseUnits, type Address } from "viem";
import { mezo, sepolia as sep } from "@ferry/shared/addresses";
import * as abi from "@ferry/shared/abis";
import { ferryEscrowAbi } from "@ferry/shared/ferryArtifacts";
import {
  DEFAULT_SOLVER_FEE_BPS,
  aTokenPermitDomain,
  ferryEscrowDomain,
  migrationIntentTypes,
  openTroveDomain,
  openTroveTypes,
  permitTypes,
  quoteMigration,
  type IntentSubmission,
  type MigrationIntent,
} from "@ferry/shared/ferry";
import { readAavePosition, readMezoParams, readTroveStatus } from "@ferry/shared/readers";
import { mezoClient, mezoTestnet, sepolia, sepoliaClient } from "@/lib/wagmi";
import { ferryAddresses, solver } from "@/lib/solver";
import { num, ratio, usd } from "@/lib/format";

type Step = { label: string; state: "todo" | "active" | "done" | "failed" };
const STEPS = ["Sign migration intent (Sepolia)", "Sign aWBTC permit (Sepolia)", "Switch to Mezo testnet", "Sign Mezo OpenTrove", "Submit to solver"];

export default function MigratePage() {
  const { address, status } = useConnection();
  const config = useConfig();
  const router = useRouter();
  const qc = useQueryClient();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["migrate", address],
    enabled: !!address,
    queryFn: async () => {
      const user = address as Address;
      const [pos, params, trove] = await Promise.all([
        readAavePosition(sepoliaClient, user),
        readMezoParams(mezoClient),
        readTroveStatus(mezoClient, user),
      ]);
      const quote = quoteMigration(pos, params, DEFAULT_SOLVER_FEE_BPS);
      if (trove === "active") quote.errors.push("This address already has an active Mezo trove (Mezo allows one per address). Use another address.");
      const solverUp = await solver.health().then(() => true, () => false);
      if (!solverUp) quote.errors.push("The Ferry solver is offline. Try again later.");
      return { pos, params, quote, trove };
    },
    refetchInterval: steps ? false : 30_000,
  });

  const mark = (i: number, state: Step["state"]) =>
    setSteps((s) => (s ?? STEPS.map((label) => ({ label, state: "todo" as const }))).map((x, j) => (j === i ? { ...x, state } : x)));

  async function migrate() {
    if (!address || !data.data) return;
    setError(null);
    setSteps(STEPS.map((label) => ({ label, state: "todo" })));
    let current = 0;
    try {
      const { pos } = data.data;
      const user = address as Address;
      // Re-quote right before signing.
      const params = await readMezoParams(mezoClient);
      const fresh = await readAavePosition(sepoliaClient, user);
      const quote = quoteMigration(fresh, params, DEFAULT_SOLVER_FEE_BPS);
      if (quote.errors.length) throw new Error(quote.errors.join("\n"));
      const now = BigInt(Math.floor(Date.now() / 1000));

      // 1. intent
      mark((current = 0), "active");
      await switchChain(config, { chainId: sepolia.id });
      const nonce = await sepoliaClient.readContract({ address: ferryAddresses.escrow, abi: ferryEscrowAbi, functionName: "nonces", args: [user] });
      const intent: MigrationIntent = {
        user,
        collateralAsset: sep.wbtc,
        collateralAmount: quote.collateralAmount,
        debtAsset: sep.usdc,
        maxDebtRepay: quote.maxDebtRepay,
        mezoCollateral: quote.mezoCollateral,
        mezoDebtAmount: quote.mezoDebtAmount,
        solverFeeBps: quote.solverFeeBps,
        nonce,
        deadline: now + 3600n,
      };
      const intentSignature = await signTypedData(config, {
        domain: ferryEscrowDomain(ferryAddresses.escrow),
        types: migrationIntentTypes,
        primaryType: "MigrationIntent",
        message: intent,
      });
      mark(0, "done");

      // 2. aToken permit
      mark((current = 1), "active");
      const permitValue = (quote.collateralAmount * 101n) / 100n + 1n;
      const permitDeadline = now + 3600n;
      const aNonce = await sepoliaClient.readContract({ address: pos.aToken, abi: abi.erc20Abi, functionName: "nonces", args: [user] });
      const permitSig = await signTypedData(config, {
        domain: aTokenPermitDomain(pos.aToken, pos.aTokenName),
        types: permitTypes,
        primaryType: "Permit",
        message: { owner: user, spender: ferryAddresses.escrow, value: permitValue, nonce: aNonce, deadline: permitDeadline },
      });
      const ps = parseSignature(permitSig);
      mark(1, "done");

      // 3. switch to Mezo (MetaMask requires the domain chainId to match the connected chain)
      mark((current = 2), "active");
      await switchChain(config, { chainId: mezoTestnet.id, addEthereumChainParameter: { chainName: "Mezo Testnet" } });
      mark(2, "done");

      // 4. Mezo OpenTrove, recipient = FerryMezo
      mark((current = 3), "active");
      const mezoDeadline = now + 2n * 3600n;
      const mNonce = await mezoClient.readContract({ address: mezo.borrowerOperationsSignatures, abi: abi.borrowerOperationsSignaturesAbi, functionName: "getNonce", args: [user] });
      const mezoSignature = await signTypedData(config, {
        domain: openTroveDomain,
        types: openTroveTypes,
        primaryType: "OpenTrove",
        message: {
          assetAmount: intent.mezoCollateral,
          debtAmount: intent.mezoDebtAmount,
          borrower: user,
          recipient: ferryAddresses.ferryMezo,
          nonce: mNonce,
          deadline: mezoDeadline,
        },
      });
      mark(3, "done");
      switchChain(config, { chainId: sepolia.id }).catch(() => {});

      // 5. submit
      mark((current = 4), "active");
      const submission: IntentSubmission = {
        intent,
        intentSignature,
        permit: { value: permitValue, deadline: permitDeadline, v: Number(ps.v ?? BigInt(ps.yParity + 27)), r: ps.r, s: ps.s },
        mezoSignature,
        mezoDeadline,
      };
      const res = await solver.submit(submission);
      mark(4, "done");
      router.push(`/status/${res.id}`);
    } catch (e) {
      mark(current, "failed");
      const msg = (e as Error & { shortMessage?: string }).shortMessage ?? (e as Error).message;
      setError(msg);
    }
  }

  /** Testnet helper: create an Aave position with faucet tokens so anyone can try Ferry. */
  async function createTestPosition() {
    if (!address) return;
    setError(null);
    try {
      await switchChain(config, { chainId: sepolia.id });
      const wbtc = parseUnits("0.045", 8);
      const send = async (label: string, tx: () => Promise<`0x${string}`>) => {
        setSetupBusy(label);
        const hash = await tx();
        await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
      };
      await send("Minting 0.045 test WBTC from Aave's faucet…", () =>
        writeContract(config, { address: sep.aaveFaucet, abi: abi.aaveFaucetAbi, functionName: "mint", args: [sep.wbtc, address, wbtc], chainId: sepolia.id }));
      await send("Approving WBTC…", () =>
        writeContract(config, { address: sep.wbtc, abi: abi.erc20Abi, functionName: "approve", args: [sep.aavePool, wbtc], chainId: sepolia.id }));
      await send("Supplying WBTC to Aave…", () =>
        writeContract(config, { address: sep.aavePool, abi: abi.aavePoolAbi, functionName: "supply", args: [sep.wbtc, wbtc, address, 0], chainId: sepolia.id }));
      await send("Borrowing 1,850 USDC…", () =>
        writeContract(config, { address: sep.aavePool, abi: abi.aavePoolAbi, functionName: "borrow", args: [sep.usdc, parseUnits("1850", 6), 2n, 0, address], chainId: sepolia.id }));
      await qc.invalidateQueries({ queryKey: ["migrate", address] });
    } catch (e) {
      setError((e as Error & { shortMessage?: string }).shortMessage ?? (e as Error).message);
    } finally {
      setSetupBusy(null);
    }
  }

  if (status !== "connected") {
    return (
      <div className="stack">
        <h1>Migrate</h1>
        <div className="card">Connect a wallet (MetaMask or another injected wallet) to read your Aave position on Sepolia.</div>
      </div>
    );
  }

  const d = data.data;
  const q = d?.quote;
  const noPosition = d && d.pos.collateralAmount === 0n && d.pos.debtAmount === 0n;

  return (
    <div className="stack">
      <div>
        <h1>Migrate</h1>
        <p className="lead">Your Aave V3 position on Sepolia, and the Mezo loan Ferry would open for you. All numbers are read live from both chains.</p>
      </div>

      {data.isLoading && <div className="card">Reading Aave and Mezo…</div>}
      {data.isError && <div className="alert alert-bad">Could not read on-chain data: {(data.error as Error).message}</div>}

      {noPosition && (
        <div className="card stack">
          <h2>No Aave position found</h2>
          <p className="muted small" style={{ margin: 0 }}>
            This address has no WBTC supplied or USDC borrowed on Aave V3 Sepolia. To try Ferry, create a test position with
            Aave&apos;s faucet tokens: 0.045 WBTC supplied and 1,850 USDC borrowed. It takes 4 transactions and needs a little Sepolia ETH.
          </p>
          <div className="row">
            <button className="btn" disabled={!!setupBusy} onClick={createTestPosition}>
              {setupBusy ?? "Create test Aave position"}
            </button>
          </div>
        </div>
      )}

      {d && q && !noPosition && (
        <>
          <div className="grid grid-2">
            <div className="card">
              <h2>Before · Aave V3</h2>
              <table className="kv">
                <tbody>
                  <tr><td>Collateral</td><td>{num(d.pos.collateralAmount, 8, 6)} WBTC</td></tr>
                  <tr><td>Debt</td><td>{num(d.pos.debtAmount, d.pos.debtDecimals)} USDC</td></tr>
                  <tr><td>Rate</td><td>{q.aaveAprPct.toFixed(2)}% variable</td></tr>
                  <tr><td>Health factor</td><td>{num(d.pos.healthFactor, 18)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="card">
              <h2>After · Mezo trove</h2>
              <table className="kv">
                <tbody>
                  <tr><td>Collateral</td><td>{num(q.mezoCollateral, 18, 6)} BTC</td></tr>
                  <tr><td>Debt</td><td>{num(q.troveDebt, 18)} MUSD</td></tr>
                  <tr><td>Rate</td><td><b style={{ color: "var(--accent)" }}>{q.mezoAprPct.toFixed(2)}% fixed</b></td></tr>
                  <tr><td>Collateral ratio</td><td>{ratio(q.icr)}</td></tr>
                  <tr><td>Liquidation price (110%)</td><td>{usd(Number(q.liquidationPrice) / 1e18)} / BTC</td></tr>
                  <tr><td>Max borrowing capacity</td><td>{num(q.maxBorrowingCapacity, 18, 0)} MUSD</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h2>Where the MUSD debt comes from</h2>
              <table className="kv">
                <tbody>
                  <tr><td>Aave debt repaid by the solver (max, incl. 0.2% interest buffer)</td><td>{num(q.maxDebtRepay, d.pos.debtDecimals)} USDC</td></tr>
                  <tr><td>Solver fee ({Number(q.solverFeeBps) / 100}%)</td><td>+ {num(q.solverFee, 18)} MUSD</td></tr>
                  <tr><td>= MUSD borrowed on Mezo (goes to the solver)</td><td>{num(q.mezoDebtAmount, 18)} MUSD</td></tr>
                  <tr><td>Mezo borrowing fee (0.1%)</td><td>+ {num(q.borrowingFee, 18)} MUSD</td></tr>
                  <tr><td>Mezo gas compensation (returned when you close)</td><td>+ {num(d.params.gasCompensation, 18)} MUSD</td></tr>
                  <tr><td><b>Trove debt</b></td><td><b>{num(q.troveDebt, 18)} MUSD</b></td></tr>
                </tbody>
              </table>
            </div>
            <div className="card stack">
              <div className="stat">
                <div className="label">Estimated yearly interest saved</div>
                <div className="value accent">{usd(q.yearlySavingsUsd)}</div>
                <div className="small muted">
                  {q.aaveAprPct.toFixed(2)}% variable → {q.mezoAprPct.toFixed(2)}% fixed on {num(d.pos.debtAmount, d.pos.debtDecimals, 0)} of debt, at today&apos;s rates
                </div>
              </div>
              {q.errors.length > 0 && (
                <div className="alert alert-bad">
                  <b>Can&apos;t migrate yet</b>
                  <ul>{q.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              )}
              <div className="alert alert-warn">
                <ul style={{ margin: 0 }}>{q.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
              <button className="btn btn-lg" disabled={q.errors.length > 0 || (steps?.some((s) => s.state === "active") ?? false)} onClick={migrate}>
                Sign & migrate
              </button>
              <p className="small muted" style={{ margin: 0 }}>
                You sign three messages: two on Sepolia, one on Mezo. Your wallet switches networks in between. You need no gas.
              </p>
            </div>
          </div>
        </>
      )}

      {steps && (
        <div className="card">
          <h2>Signing</h2>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={s.label} className={s.state}>
                <span className="mark">{s.state === "done" ? "✓" : s.state === "failed" ? "!" : i + 1}</span>
                <span className="title">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {error && <div className="alert alert-bad" style={{ whiteSpace: "pre-wrap" }}>{error}</div>}
    </div>
  );
}
