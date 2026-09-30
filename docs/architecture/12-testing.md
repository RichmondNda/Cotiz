# 12 · Stratégie de tests

| Niveau | Outil | Priorités |
|---|---|---|
| Domaine | Vitest + fast-check | Vecteurs de `docs/specs/test-vectors/` (exactement) + propriétés : Σ allocations = montant, aucune allocation > reste dû, ordre respecté, dates en fin de mois et années bissextiles |
| Intégration | Vitest + Testcontainers (PostgreSQL 16, Redis 7, MinIO) | Cas d'usage complets ; RLS par table ; concurrence (validations simultanées) ; idempotence ; outbox |
| Isolation | Suite dédiée `backend/test/isolation` | Pour chaque endpoint tenant : l'association B n'accède jamais aux données de A (404) ; un souscripteur ne lit que ses données |
| Contrat | Zod | Chaque réponse réelle et chaque mock passent leur schéma ; `oasdiff` sur l'OpenAPI généré |
| Bout en bout | Playwright | Parcours de référence : demande → approbation → onboarding → projet → inscription → code remis → activation → déclaration → validation → notification ; **sans aucun fournisseur configuré** |
| Charge | k6 | Grille 200 × 24, tableau de bord, 100 déclarations simultanées, 2 validations concurrentes |
| Sécurité | OWASP ZAP (local au lot 3.5, puis recette à partir du lot 7.1) | Analyse de base à chaque version |

Couverture visée : 95 % sur `packages/domain` et le module `ledger`. Ailleurs, pas d'objectif chiffré : les tests de parcours comptent davantage.

Règles :
- Un test d'isolation doit être **vu échouer** une fois (politique volontairement retirée) avant d'être considéré valide.
- Pas de mock de la base dans les tests d'intégration : vraie PostgreSQL via Testcontainers.
- Les données de test reprennent le jeu de référence (Awa Koné, Moussa Diarra, Entraide Yopougon).
