"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useConfig, useConnection } from "wagmi";
import { signTypedData, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { getAddress, isAddress, parseSignature, parseUnits, type Address } from "viem";
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
import { detectDebtAsset, readAavePosition, readMezoParams, readTroveStatus } from "@ferry/shared/readers";
import { mezoClient, mezoTestnet, sepolia, sepoliaClient } from "@/lib/wagmi";
import { ferryAddresses, solver } from "@/lib/solver";
import { num, usd } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { ConnectButton } from "@/components/ConnectButton";
import { Explain, HealthMeter, NetworkBadge, Skeleton, Wizard } from "@/components/ui";

const WIZARD = ["Connect", "Your loan", "Review", "Sign", "Track"];

type SignStep = { title: string; hint: string; state: "todo" | "active" | "done" | "failed" };
const SIGN_STEPS: Omit<SignStep, "state">[] = [
  { title: "Approve the move", hint: "Your wallet shows a “MigrationIntent” message on Sepolia. It lists exactly what moves. Signing is free." },
  { title: "Allow Ferry to move your aWBTC", hint: "A “Permit” message for your Aave collateral token. Also free, no gas." },
  { title: "Switch to Mezo testnet", hint: "Your wallet asks to switch (or add) the Mezo testnet network. Approve it." },
  { title: "Approve your new Mezo loan", hint: "Mezo’s own “OpenTrove” message with the exact BTC and MUSD amounts. Free, no gas on Mezo." },
  { title: "Hand over to the solver", hint: "Ferry sends your signatures to the solver, which checks everything and starts the migration." },
];

const toUsd = (btcWad: bigint, priceWad: bigint) => (Number(btcWad) / 1e18) * (Number(priceWad) / 1e18);

export default function MigratePage() {
  const { address: walletAddress, status } = useConnection();
  // Read-only preview: /migrate?address=0x… shows any address’s loan (signing still needs that wallet connected).
  const [previewAddress, setPreviewAddress] = useState<Address | undefined>();
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("address");
    if (a && isAddress(a)) setPreviewAddress(getAddress(a));
  }, []);
  const address = walletAddress ?? previewAddress;
  const preview = !walletAddress && !!previewAddress;
  const config = useConfig();
  const router = useRouter();
  const qc = useQueryClient();
  const [signing, setSigning] = useState<SignStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState<string | null>(null);
  const [testAsset, setTestAsset] = useState<"USDC" | "USDT">("USDC");
  const [acks, setAcks] = useState([false, false, false]);

  const data = useQuery({
    queryKey: ["migrate", address],
    enabled: !!address,
    queryFn: async () => {
      const user = address as Address;
      const debt = await detectDebtAsset(sepoliaClient, user);
      const [pos, params, trove] = await Promise.all([
        readAavePosition(sepoliaClient, user, debt.asset),
        readMezoParams(mezoClient),
        readTroveStatus(mezoClient, user),
      ]);
      const quote = quoteMigration(pos, params, DEFAULT_SOLVER_FEE_BPS);
      if (trove === "active") quote.errors.push("This address already has a Mezo loan. Mezo allows one loan per address, so please use a different address.");
      if (debt.multiple) quote.errors.push("You owe both USDC and USDT on Aave. Ferry can move a loan in one stablecoin at a time.");
      const solverUp = await solver.health().then(() => true, () => false);
      if (!solverUp) quote.errors.push("The Ferry solver isn’t responding. It may be waking up; refresh in a minute.");
      return { pos, params, quote, trove, debt };
    },
    refetchInterval: signing ? false : 30_000,
  });

  const mark = (i: number, state: SignStep["state"]) =>
    setSigning((s) => (s ?? SIGN_STEPS.map((x) => ({ ...x, state: "todo" as const }))).map((x, j) => (j === i ? { ...x, state } : x)));

  async function migrate() {
    if (!address || !data.data) return;
    setError(null);
    setSigning(SIGN_STEPS.map((x) => ({ ...x, state: "todo" })));
    let current = 0;
    try {
      const { pos, debt } = data.data;
      const user = address as Address;
      const params = await readMezoParams(mezoClient);
      const fresh = await readAavePosition(sepoliaClient, user, debt.asset);
      const quote = quoteMigration(fresh, params, DEFAULT_SOLVER_FEE_BPS);
      if (quote.errors.length) throw new Error(quote.errors.join("\n"));
      const now = BigInt(Math.floor(Date.now() / 1000));

      mark((current = 0), "active");
      await switchChain(config, { chainId: sepolia.id });
      const nonce = await sepoliaClient.readContract({ address: ferryAddresses.escrow, abi: ferryEscrowAbi, functionName: "nonces", args: [user] });
      const intent: MigrationIntent = {
        user,
        collateralAsset: sep.wbtc,
        collateralAmount: quote.collateralAmount,
        debtAsset: debt.asset,
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

      mark((current = 2), "active");
      await switchChain(config, { chainId: mezoTestnet.id, addEthereumChainParameter: { chainName: "Mezo Testnet" } });
      mark(2, "done");

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
      setError(friendlyError(e));
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
      await send("1/4 · Getting 0.045 test WBTC from Aave’s faucet…", () =>
        writeContract(config, { address: sep.aaveFaucet, abi: abi.aaveFaucetAbi, functionName: "mint", args: [sep.wbtc, address, wbtc], chainId: sepolia.id }));
      await send("2/4 · Allowing Aave to use your WBTC…", () =>
        writeContract(config, { address: sep.wbtc, abi: abi.erc20Abi, functionName: "approve", args: [sep.aavePool, wbtc], chainId: sepolia.id }));
      await send("3/4 · Supplying WBTC to Aave…", () =>
        writeContract(config, { address: sep.aavePool, abi: abi.aavePoolAbi, functionName: "supply", args: [sep.wbtc, wbtc, address, 0], chainId: sepolia.id }));
      const stable = testAsset === "USDT" ? sep.usdt : sep.usdc;
      await send(`4/4 · Borrowing 1,850 ${testAsset}…`, () =>
        writeContract(config, { address: sep.aavePool, abi: abi.aavePoolAbi, functionName: "borrow", args: [stable, parseUnits("1850", 6), 2n, 0, address], chainId: sepolia.id }));
      await qc.invalidateQueries({ queryKey: ["migrate", address] });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSetupBusy(null);
    }
  }

  // ------------------------------------------------------------------ render

  const d = data.data;
  const q = d?.quote;
  const noPosition = d && d.pos.collateralAmount === 0n && d.pos.debtAmount === 0n;
  const canSign = !!q && q.errors.length === 0 && acks.every(Boolean) && !signing?.some((s) => s.state === "active");
  const wizardStep = status !== "connected" && !preview ? 0 : !d || noPosition ? 1 : signing ? 3 : 2;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0 }}>Move my loan</h1>
          <NetworkBadge />
        </div>
        <Wizard steps={WIZARD} current={wizardStep} />
      </div>

      {preview && (
        <div className="alert alert-info callout">
          <span className="icon" aria-hidden>i</span>
          <span>
            Read-only preview of <span className="mono">{previewAddress?.slice(0, 6)}…{previewAddress?.slice(-4)}</span>. These are its live
            numbers. To move a loan, connect the wallet that owns it.
          </span>
        </div>
      )}

      {status !== "connected" && !preview && (
        <div className="card stack" style={{ maxWidth: 620 }}>
          <h2 style={{ margin: 0 }}>Connect your wallet</h2>
          <p className="muted" style={{ margin: 0 }}>
            Ferry only reads your Aave position until you choose to sign. Use MetaMask (or another browser wallet) on the
            Sepolia test network.
          </p>
          <div><ConnectButton /></div>
        </div>
      )}

      {status === "connected" && data.isLoading && (
        <div className="card"><p className="muted">Reading your loan on Aave and Mezo’s live numbers…</p><Skeleton /></div>
      )}
      {data.isError && <div className="alert alert-bad">{friendlyError(data.error)}</div>}

      {noPosition && !preview && (
        <div className="card stack" style={{ maxWidth: 720 }}>
          <h2 style={{ margin: 0 }}>No Aave loan found on this address</h2>
          <p className="muted" style={{ margin: 0 }}>
            To try Ferry, create a practice loan with Aave’s free test tokens: supply <b>0.045 WBTC</b> and borrow <b>1,850 {testAsset}</b>.
            It takes 4 quick transactions and a little Sepolia ETH for gas.
          </p>
          <div className="row">
            <select value={testAsset} onChange={(e) => setTestAsset(e.target.value as "USDC" | "USDT")} disabled={!!setupBusy} className="btn btn-ghost" aria-label="Stablecoin to borrow">
              <option value="USDC">Borrow USDC</option>
              <option value="USDT">Borrow USDT</option>
            </select>
            <button className="btn" disabled={!!setupBusy} onClick={createTestPosition}>
              {setupBusy ?? "Create a practice loan"}
            </button>
          </div>
          {setupBusy && <p className="small muted" style={{ margin: 0 }}>Confirm each transaction in your wallet. This page updates when it’s done.</p>}
        </div>
      )}

      {d && q && !noPosition && (
        <>
          <div className="card stack" style={{ gap: 10 }}>
            <p className="eyebrow" style={{ margin: 0 }}>Your loan on Aave today</p>
            <p className="sentence">
              You’ve supplied <b>{num(d.pos.collateralAmount, 8, 4)} WBTC</b> (≈ {usd(toUsd(q.mezoCollateral, d.params.btcPrice))}) and
              borrowed <b>{num(d.pos.debtAmount, d.pos.debtDecimals)} {d.debt.symbol}</b> at a <b>{q.aaveAprPct.toFixed(1)}% variable</b> rate.
            </p>
            <p className="small muted" style={{ margin: 0 }}>Aave health factor {num(d.pos.healthFactor, 18)} · variable means the rate can change at any moment.</p>
          </div>

          <div className="card stack" style={{ gap: 18 }}>
            <p className="eyebrow" style={{ margin: 0 }}>Your new loan on Mezo</p>
            <div className="figures">
              <div className="kpi"><span className="k">Collateral</span><span className="v">{num(q.mezoCollateral, 18, 4)} BTC</span><span className="s">same Bitcoin, moved 1:1</span></div>
              <div className="kpi"><span className="k">You’ll owe</span><span className="v">{num(q.troveDebt, 18, 0)} MUSD</span><span className="s">a BTC-backed dollar stablecoin</span></div>
              <div className="kpi"><span className="k">Interest</span><span className="v" style={{ color: "var(--accent)" }}>{q.mezoAprPct.toFixed(1)}% fixed</span><span className="s">locked when the loan opens</span></div>
              <div className="kpi"><span className="k">Saved per year</span><span className="v">{usd(q.yearlySavingsUsd)}</span><span className="s">at today’s rates</span></div>
            </div>
            <HealthMeter icr={q.icr} />
            <p className="small" style={{ margin: 0 }}>
              Your loan can be liquidated if BTC falls below <b>{usd(Number(q.liquidationPrice) / 1e18)}</b>. Today it’s{" "}
              {usd(Number(d.params.btcPrice) / 1e18)}, a{" "}
              {Math.max(0, (1 - Number(q.liquidationPrice) / Number(d.params.btcPrice)) * 100).toFixed(0)}% drop away.
            </p>
            <Explain title={`Where does ${num(q.troveDebt, 18, 0)} MUSD come from?`}>
              <table className="kv">
                <tbody>
                  <tr><td>Your Aave debt, plus a small buffer for interest until it’s repaid</td><td>{num(q.maxDebtRepay, d.pos.debtDecimals)} {d.debt.symbol}</td></tr>
                  <tr><td>Ferry solver fee ({Number(q.solverFeeBps) / 100}%)</td><td>+ {num(q.solverFee, 18)} MUSD</td></tr>
                  <tr><td>Mezo borrowing fee (0.1%)</td><td>+ {num(q.borrowingFee, 18)} MUSD</td></tr>
                  <tr><td>Mezo deposit, which you get back when you close the loan</td><td>+ {num(d.params.gasCompensation, 18, 0)} MUSD</td></tr>
                  <tr><td><b>Total Mezo loan</b></td><td><b>{num(q.troveDebt, 18)} MUSD</b></td></tr>
                </tbody>
              </table>
            </Explain>
            <Explain title="What is a collateral ratio?">
              It’s your Bitcoin’s value divided by what you owe. Mezo liquidates loans below 110%. Ferry won’t open a loan under 120%,
              and warns you under 150%: if Mezo as a whole ever drops below 150% (“Recovery Mode”), loans under 150% can be liquidated too.
            </Explain>
          </div>

          {q.errors.length > 0 && (
            <div className="alert alert-bad">
              <b>This loan can’t be moved yet</b>
              <ul>{q.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}

          {q.errors.length === 0 && !preview && (
            <div className="card stack" style={{ maxWidth: 760 }}>
              <h2 style={{ margin: 0 }}>Before you sign</h2>
              <ul className="checklist">
                {[
                  <>I understand my debt changes from {d.debt.symbol} to <b>MUSD</b>, Mezo’s Bitcoin-backed stablecoin.</>,
                  <>I understand my loan can be liquidated if BTC falls below <b>{usd(Number(q.liquidationPrice) / 1e18)}</b>.</>,
                  <>I understand this is a <b>testnet</b> demo and the contracts aren’t audited.</>,
                ].map((text, i) => (
                  <li key={i}>
                    <label>
                      <input type="checkbox" checked={acks[i]} onChange={(e) => setAcks((a) => a.map((v, j) => (j === i ? e.target.checked : v)))} />
                      <span>{text}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button className="btn btn-lg btn-block" disabled={!canSign} onClick={migrate}>
                {signing?.some((s) => s.state === "active") ? "Check your wallet…" : "Sign & move my loan"}
              </button>
              <p className="small muted" style={{ margin: 0, textAlign: "center" }}>
                3 signatures · free · no gas on Mezo · about 3 minutes in total
              </p>
            </div>
          )}
        </>
      )}

      {signing && (
        <div className="card" style={{ maxWidth: 760 }}>
          <h2>Signing</h2>
          <ol className="steps">
            {signing.map((s, i) => (
              <li key={s.title} className={s.state}>
                <span className="mark">{s.state === "done" ? "✓" : s.state === "failed" ? "!" : i + 1}</span>
                <div>
                  <div className="title">{s.title}</div>
                  {(s.state === "active" || s.state === "failed") && <div className="small muted">{s.hint}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {error && (
        <div className="alert alert-bad callout" style={{ maxWidth: 760 }}>
          <span className="icon" aria-hidden>!</span>
          <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
        </div>
      )}
    </div>
  );
}
