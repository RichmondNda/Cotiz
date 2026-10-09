# syntax=docker/dockerfile:1
# Image du front (Nuxt, serveur Nitro autonome) — construite depuis la racine du dépôt :
#   docker build -f infra/docker/web.Dockerfile -t cotiz-web .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "frontend..."
RUN pnpm --filter "frontend..." run build

FROM node:22-bookworm-slim AS runtime
# Correctifs de sécurité Debian publiés après l'image de base (ex. pcre2, CVE-2026-103111).
RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/*
# npm, npx et corepack ne servent qu'au build : les retirer supprime leurs vulnérabilités de l'image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
# .output est autonome : serveur Nitro et dépendances tracées.
COPY --from=build --chown=node:node /repo/frontend/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
