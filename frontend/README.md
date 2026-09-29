# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Vérifications de la V0

Avec le serveur de dev lancé (`npm run dev`) :

| Script | Rôle |
|---|---|
| `npm run e2e` | 4 parcours complets par l'interface (public, souscripteur, gestionnaire, plateforme) ; captures dans `.verif/e2e/` |
| `npm run coherence` | Mêmes montants et compteurs d'un écran à l'autre (Moussa Diarra, Awa Koné, Centre communautaire, plateforme) |
| `npm run a11y` | Audit axe-core (WCAG 2.1 A/AA) de toutes les routes en 1440 et 390 px |
| `npm run capture -- <route>` | Capture d'un écran à comparer avec `design/screens/` |

Sans serveur : `npm run typecheck`, `npm run lint`, `npm test` (tests unitaires) et `npm run contrat-api`, qui
régénère `../docs/api-v0.md`, le contrat d'API que le back-end NestJS doit respecter.

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
