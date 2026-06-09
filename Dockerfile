# iii engine + MAT worker, in one image, for the `iii` backend.
#
# Runs the iii engine (WebSocket bus :49134, HTTP API :3111) and our worker
# (iii-worker/) which registers `mat::run` and a POST /run HTTP trigger. The
# Vercel app talks only to :3111 over HTTPS. See README "Deploy the iii engine".
#
# We take the engine binary from the official distroless image (iiidev/iii) and
# run it alongside our Node worker in a node:22-slim base (the worker needs
# Node/pnpm/tsx, which the distroless engine image doesn't have).

# Stage 1: the official iii engine image, just to lift its binary.
FROM iiidev/iii:latest AS engine

# Stage 2: our runtime — Node for the worker + the engine binary copied in.
FROM node:22-slim

WORKDIR /app

# ca-certs for outbound TLS (provider API calls from the worker).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# The official engine binary (distroless image puts it at /app/iii).
COPY --from=engine /app/iii /usr/local/bin/iii

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
