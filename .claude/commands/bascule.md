---
description: Basculer un endpoint des données simulées vers le back réel
argument-hint: <id d'endpoint, ex. lg.grid>
---
Applique le protocole de `docs/architecture/10-front-integration.md` à l'endpoint $ARGUMENTS (défini dans `docs/specs/endpoints.yaml`) :
1. Vérifie que le schéma existe dans `packages/contracts` et que l'implémentation back existe avec ses tests (nominal, erreurs, isolation, permissions).
2. Écris ou complète le test de conformité : réponse réelle (Testcontainers) et réponse simulée passent le même schéma et exposent les mêmes codes d'erreur.
3. Ajoute l'id à `frontend/server/bascule/real-endpoints.ts`.
4. Liste les écrans concernés (`docs/specs/screens.yaml`) et vérifie qu'ils fonctionnent contre l'API locale (`pnpm dev`, NestJS sur :4000) : `/verifier-ecran` sur chacun (rendu inchangé par rapport à `design/screens/`, champ `mockup`) ; ajoute ou mets à jour les parcours de `frontend/tests/e2e/`.
5. Si c'est le dernier endpoint du lot à basculer, supprime les handlers simulés (Nitro) correspondants.
