/**
 * Retries with backoff. Public testnet RPCs are load-balanced: right after a receipt, the next
 * eth_call / estimateGas can land on a node that hasn't seen that block yet and revert spuriously.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  { tries = 6, delayMs = 2_000, label = "call", log = (m: string) => console.log(m) } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i === tries) break;
      const msg = (e as Error).message?.split("\n")[0] ?? String(e);
      log(`  ${label} failed (attempt ${i}/${tries}): ${msg} — retrying`);
      await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
  throw lastError;
}
