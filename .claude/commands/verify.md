---
description: Lancer toutes les vérifications et résumer les échecs
---
Lance `pnpm verify` (avant le lot 0.1, qui le crée : depuis `frontend/`, `npm run lint`, `npm run typecheck`, `npm test`, puis `node tools/check-docs.mjs` à la racine). S'il échoue, regroupe les échecs par cause (types, lint, test unitaire, isolation, contrat, mocks, cohérence docs), donne pour chacun le fichier et la ligne, et propose la correction. Ne corrige rien sans mon accord si la correction touche `docs/specs/`, une migration ou une politique RLS.
