# Ferry solver. Build from the repo root:  docker build -f solver/Dockerfile -t ferry-solver .
FROM node:24-slim
WORKDIR /repo

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY solver/package.json solver/
COPY contracts/package.json contracts/
COPY app/package.json app/
# Full workspace install (workspace-filtered `npm ci` is unreliable); app/contracts sources are not copied.
RUN npm ci --no-audit --no-fund

COPY shared ./shared
COPY solver ./solver

ENV NODE_ENV=production \
    FERRY_STORE_FILE=/data/intents.json \
    PORT=8787
EXPOSE 8787
WORKDIR /repo/solver
CMD ["npx", "tsx", "src/server.ts"]
