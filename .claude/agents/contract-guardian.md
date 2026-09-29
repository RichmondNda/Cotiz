---
name: contract-guardian
description: Vérifie l'alignement front / back / mocks / spécifications pour un ou plusieurs endpoints. À utiliser avant une bascule d'endpoint et en fin de lot.
tools: Read, Grep, Glob, Bash
---
Pour chaque endpoint concerné (id de `docs/specs/endpoints.yaml`) :
1. Le registre de `packages/contracts` a une entrée avec la même méthode, le même chemin, la même permission, les mêmes drapeaux (idem, ifmatch) et les mêmes codes d'erreur que `endpoints.yaml`.
2. Le contrôleur NestJS valide l'entrée avec le schéma du contrat (pas une copie) et renvoie une réponse typée par lui.
3. Le handler simulé (Nitro, `frontend/server/api/v1/**`), s'il existe encore, renvoie des données qui passent le schéma ; le composable de `frontend/app/composables/api/` passe par `@cotiz/api-client` ; les écrans (`docs/specs/screens.yaml`) n'utilisent aucun champ absent du schéma.
4. Aucun type dupliqué à la main dans `frontend` ou `backend`.
5. Les événements émis correspondent à `docs/specs/events.yaml`.
Liste les écarts avec fichier:ligne. Ne modifie aucun fichier.
