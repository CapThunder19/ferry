# Deploying Ferry (testnet)

Two pieces go online: the **solver** (a long-running Node service holding the solver key) and the **app** (Next.js).

## 1. Solver: Render (blueprint) or Railway (Dockerfile)

The solver needs a persistent disk for `intents.json` (its state machine resumes from it after restarts).

### Render
1. Push the repo to GitHub.
2. Render → **New → Blueprint** → pick the repo. Render reads [`render.yaml`](../render.yaml).
3. Set the secret env vars when prompted:
   - `SOLVER_SEPOLIA_KEY`, `SOLVER_MEZO_KEY`: the **testnet** solver key (same value for both is fine).
4. Deploy. Check `https://<service>.onrender.com/health` → `{"ok":true,…}`.

The blueprint uses Render's **free** plan: no persistent disk (intent history in `/tmp` is lost on restart; funds are
always safe on chain) and the service sleeps after 15 min idle (first request then takes ~1 min). For longer use,
switch to `plan: starter`, add a disk at `/data` and set `FERRY_STORE_FILE=/data/intents.json`.

**Keep it awake (built in):** the solver pings its own public `/health` every 10 minutes
([`solver/src/keepalive.ts`](../solver/src/keepalive.ts)). On Render this needs no setup: it uses the
`RENDER_EXTERNAL_URL` Render sets automatically. Elsewhere set `KEEPALIVE_URL`; tune with `KEEPALIVE_MINUTES`.
It keeps the service from going idle but can't wake it once asleep, so if Render restarts it, open `/health` once.

**Backup:** the workflow [`.github/workflows/keepalive.yml`](../.github/workflows/keepalive.yml) also pings `/health`
every 10 minutes. Enable it by adding a repository **variable** `SOLVER_URL` (GitHub → Settings → Secrets and
variables → Actions → Variables → New repository variable) with the Render URL. GitHub may delay scheduled runs by a
few minutes; for a guaranteed 5-minute ping use a free monitor such as UptimeRobot on the same `/health` URL.

### Railway
1. New project → **Deploy from GitHub repo**.
2. Settings → Build → **Dockerfile path** `solver/Dockerfile` (build context: repo root).
3. Add a **Volume** mounted at `/data`.
4. Variables: `SOLVER_SEPOLIA_KEY`, `SOLVER_MEZO_KEY` (testnet key), optionally `SEPOLIA_RPC_URL`, `MEZO_RPC_URL`.
5. Generate a public domain → check `/health`.

### Local alternative for a demo
`npm start -w solver`, then expose it with `cloudflared tunnel --url http://localhost:8787` (or `ngrok http 8787`).

Optional env vars: `FERRY_REPUBLISH_AFTER_MINUTES` (default 10), `FERRY_MAX_REPUBLISHES` (3), `FERRY_AUTO_FAUCET`
(`false` disables the Aave-faucet top-up of the solver's USDC/USDT).

## 2. App: Vercel

1. Vercel → **Add New Project** → import the repo.
2. **Root Directory:** `app` (Vercel detects the npm workspace and installs from the repo root).
3. Framework preset: Next.js (auto).
4. Environment variables:
   - `NEXT_PUBLIC_SOLVER_URL` = the solver's public URL from step 1 (no trailing slash)
   - optional `NEXT_PUBLIC_SEPOLIA_RPC_URL`, `NEXT_PUBLIC_MEZO_RPC_URL`
5. Deploy, then put the URL in the README ("Live demo") and the AKINDO form.

Contract addresses come from `shared/deployments.json` at build time, so **redeploy the app after redeploying contracts**.

## 3. Before going live

- [ ] Solver wallet funded: Sepolia ETH for gas; **Mezo testnet BTC ≥ the WBTC of each migration you expect** (about 0.045 BTC each).
- [ ] `/health` reachable from the browser (CORS is open: `*`).
- [ ] One migration from the live site; add its transaction links to `docs/EVIDENCE.md` (M6).
