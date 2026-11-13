// Self keep-alive for hosts that sleep idle services (Render free plan sleeps after 15 min without inbound traffic).
// The solver calls its own PUBLIC URL, so the request goes through the host's proxy and counts as inbound traffic.
// URL: KEEPALIVE_URL, else Render's automatic RENDER_EXTERNAL_URL. Disabled when neither is set (e.g. locally).
import { optionalEnv } from "./env.js";

export function startKeepAlive(log = (m: string) => console.log(`[keepalive] ${m}`)) {
  const base = optionalEnv("KEEPALIVE_URL") ?? optionalEnv("RENDER_EXTERNAL_URL");
  if (!base) return undefined;
  const minutes = Math.max(1, Number(optionalEnv("KEEPALIVE_MINUTES") ?? 10)); // < 15 min Render idle limit
  const url = `${base.replace(/\/+$/, "")}/health`;

  const ping = async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) log(`ping ${url} → HTTP ${res.status}`);
    } catch (e) {
      log(`ping ${url} failed: ${(e as Error).message}`);
    }
  };

  log(`pinging ${url} every ${minutes} min`);
  const timer = setInterval(ping, minutes * 60_000);
  timer.unref?.();
  return timer;
}
