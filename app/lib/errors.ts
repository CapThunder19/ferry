/** Turns wallet, RPC and solver errors into sentences a person can act on. */
export function friendlyError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; code?: number };
  const raw = `${err?.shortMessage ?? ""} ${err?.message ?? String(e)}`;
  const m = raw.toLowerCase();

  if (m.includes("user rejected") || m.includes("user denied") || err?.code === 4001)
    return "You cancelled the request in your wallet. Nothing was sent. You can try again whenever you’re ready.";
  if (m.includes("insufficient funds"))
    return "Your wallet doesn’t have enough Sepolia ETH to pay for gas. Get a little from a Sepolia faucet and try again.";
  if (m.includes("4902") || (m.includes("chain") && (m.includes("not configured") || m.includes("unrecognized"))))
    return "Your wallet doesn’t know the Mezo testnet yet. Approve “Add network” when it asks, then try again.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed"))
    return "We couldn’t reach the Ferry solver. It may be waking up (about a minute on the free host). Please try again shortly.";
  if (m.includes("already has an active mezo trove") || m.includes("already have an active mezo trove") || m.includes("one trove per address"))
    return "This address already has a Mezo loan. Mezo allows one per address, so please use a different address.";
  if (m.includes("solver btc inventory"))
    return "The solver is out of testnet BTC right now, so it can’t open your Mezo loan. Please try again later.";
  if (m.includes("recovery mode"))
    return "Mezo is in Recovery Mode right now, so new loans need extra collateral. Please try again later.";
  if (m.includes("deadline"))
    return "Your signatures expired. Please start the migration again.";

  const first = (err?.shortMessage ?? err?.message ?? String(e)).split("\n").slice(0, 3).join("\n");
  return first.length > 400 ? `${first.slice(0, 400)}…` : first;
}
