# Cotiz — front (Nuxt 4)

Membre du workspace pnpm du dépôt : toutes les commandes se lancent **depuis la racine**, avec `pnpm --filter frontend <script>`.

## Installation

```bash
pnpm install
```

## Serveur de développement

Sur `http://localhost:3000` (données simulées par les handlers Nitro de `server/`) :

```bash
pnpm --filter frontend dev
```

## Vérifications de la V0

Avec le serveur de dev lancé :

| Script | Rôle |
|---|---|
| `pnpm --filter frontend e2e` | 4 parcours complets par l'interface (public, souscripteur, gestionnaire, plateforme) ; captures dans `.verif/e2e/` |
| `pnpm --filter frontend coherence` | Mêmes montants et compteurs d'un écran à l'autre (Moussa Diarra, Awa Koné, Centre communautaire, plateforme) |
| `pnpm --filter frontend a11y` | Audit axe-core (WCAG 2.1 A/AA) de toutes les routes en 1440 et 390 px |
| `pnpm --filter frontend capture <route>` | Capture d'un écran à comparer avec `design/screens/` |

Sans serveur : `typecheck`, `lint`, `test` (tests unitaires) et `contrat-api`, qui régénère `../docs/api-v0.md`, le contrat
d'API transitoire de la V0.

## Production

```bash
pnpm --filter frontend build     # sortie dans .output/
pnpm --filter frontend preview   # aperçu local du build
```

Voir la [documentation de déploiement Nuxt](https://nuxt.com/docs/getting-started/deployment).
