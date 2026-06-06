# iii engine + MAT worker, in one image, for the `iii` backend.
#
# Runs the iii engine (WebSocket bus :49134, HTTP API :3111) and our worker
# (iii-worker/) which registers `mat::run` and a POST /run HTTP trigger. The
# Vercel app talks only to :3111 over HTTPS. See README "Deploy the iii engine".
FROM node:22-slim

WORKDIR /app

# curl + ca-certs for the engine installer and TLS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install the iii engine (provides the `iii` binary). The installer drops it
# under one of these prefixes depending on version; add them all to PATH.
RUN curl -fsSL https://install.iii.dev/iii/main/install.sh | sh
ENV PATH="/root/.iii/bin:/root/.local/bin:/usr/local/bin:${PATH}"

# JS deps (includes tsx, used to run the TypeScript worker).
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# App source — the worker imports the shared runners under lib/.
COPY . .

# Only the engine's HTTP API is exposed publicly; :49134 stays internal.
EXPOSE 3111
ENV III_ENGINE_URL=ws://localhost:49134

ENTRYPOINT ["./docker-entrypoint.sh"]
