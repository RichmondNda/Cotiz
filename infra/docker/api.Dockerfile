# syntax=docker/dockerfile:1
# Image de l'api et du worker (même image) — construite depuis la racine du dépôt :
#   docker build -f infra/docker/api.Dockerfile -t cotiz-api .
# api : commande par défaut ; worker : `node dist/worker.js`.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "backend..."
RUN pnpm --filter "backend..." run build
# Dépendances de production uniquement, paquets du workspace inclus (dist/).
RUN pnpm --filter backend deploy --legacy --prod /out

FROM node:22-bookworm-slim AS runtime
# npm, npx et corepack ne servent qu'au build : les retirer supprime leurs vulnérabilités de l'image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
