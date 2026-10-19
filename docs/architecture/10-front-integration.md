# 10 · Intégration front : contrat, mocks Nitro, bascule

> Adapté au dépôt réel : le front existe déjà (`frontend/`, Nuxt 4, V0 complète sur mocks Nitro — lots front 00 à 09).
> On **garde les mocks Nitro** (pas de MSW) et on les aligne sur le contrat au lot 0.3.

## Trois mécanismes
1. **Contrat unique** — `packages/contracts` : schémas Zod de chaque endpoint de `docs/specs/endpoints.yaml` → types TS (front et back), validation des entrées (back), OpenAPI 3.1 (généré), client typé `packages/api-client`.
2. **Logique partagée** — `packages/domain` : `generateSchedule`, `proposeAllocation`, `validateAllocation`, `installmentStatus`, `memberStanding`, `formatMoney`, `Money`. Même code dans l'aperçu front et dans la transaction back ; vecteurs de test communs (`docs/specs/test-vectors/`). Côté front, `formatFCFA()` (`frontend/app/utils/format.ts`) délègue à `formatMoney`.
3. **Données simulées issues du contrat** — handlers Nitro dans `frontend/server/api/v1/**` (mêmes chemins que l'API NestJS, `/api/v1/...`), typés par le registre de `@cotiz/contracts`, alimentés par le jeu de référence (`docs/specs/seed-reference.yaml`) et le store en mémoire `frontend/server/mocks/`. Un test vérifie que chaque réponse simulée passe son schéma. Les scénarios de dev (`?scenario=<état>`) sont conservés.

## Situation de départ (avant le lot 0.3)
- Les handlers actuels (`frontend/server/api/**`, hors `v1/`) servent des chemins **français** (`/api/moi`, `/api/projets`…) décrits dans `docs/api-v0.md`, avec les types de `frontend/types/`.
- Le lot 0.3 les remplace par des handlers `/api/v1/...` conformes à `endpoints.yaml` et fait passer les composables `frontend/app/composables/api/*` sur `@cotiz/api-client`. Il produit d'abord la table de correspondance `docs/specs/v0-mapping.md` (route V0 → id d'endpoint).
- `docs/api-v0.md` reste la trace de la V0 jusqu'à la fin du lot 0.3, puis est supprimé (avec le script `npm run contrat-api` et son contrôle en CI).

## Registre de bascule
Fichier unique `frontend/server/bascule/real-endpoints.ts` : chaque id de `docs/specs/endpoints.yaml` servi par NestJS,
pour **tous les espaces** (`all`) ou **certains** (liste d'espaces : une bascule progressive, espace par espace).
```ts
export const REAL_ENDPOINTS: ReadonlyMap<EndpointId, 'all' | readonly BasculeSpace[]> = new Map([
  ['sys.health', 'all'],
  // lot 1.1 : espace plateforme seulement (gestionnaire et souscripteur au lot 1.2)
  ['auth.login', ['platform']], ['me', ['platform']], ['fl.upload', ['platform']], …
])
```
- Middleware Nitro `frontend/server/middleware/bascule.ts` : pour une requête `/api/v1/**`, retrouve l'id d'endpoint (méthode + chemin, via le registre du contrat) ; si l'id est basculé pour l'espace de la requête **ou** si `NUXT_MOCKS=0`, `proxyRequest()` vers `NUXT_API_ORIGIN` (NestJS, `http://localhost:4000` en local) ; sinon le handler simulé répond.
- Espace de la requête (aiguillage seulement, jamais une preuve : NestJS vérifie tout) : claim `space` du jeton `Bearer`, sinon `space` du corps JSON (connexion, activation, mot de passe oublié), sinon claim `space` du `resetToken` ; `auth.refresh` part vers NestJS dès que le cookie `cotiz_refresh` (posé par NestJS seul) est présent.
- Session d'un espace basculé : jeton d'accès **en mémoire** (`app/utils/jeton-acces.ts`), renouvelé par le cookie et rejoué une fois sur une 401, un seul renouvellement à la fois tous onglets confondus (Web Locks) ; pages de l'espace rendues dans le navigateur (`routeRules … ssr: false` : au rendu serveur, aucune identité). Pendant la transition, le cookie simulé `cotiz_role` reste posé pour les écrans encore simulés, et `features` de `/me` garde les fonctionnalités des lots non basculés (`app/utils/fonctionnalites.ts`).
- Le navigateur ne parle qu'à Nuxt (même origine : pas de CORS, cookies d'authentification sur le domaine du front).
- En développement local : `NUXT_MOCKS=1`. Build de production (répété en local au lot 3.5, déployé en recette et en production au lot 7.1) : `NUXT_MOCKS=0` et les handlers simulés sont exclus du build (`nitro.ignore` conditionnel).
- Comptes réels de développement (espaces basculés) : `COTIZ_DEV_SEED=1 pnpm --filter backend cli seed-dev` (NODE_ENV development ou test seulement) ; le script de capture et les parcours e2e s'y connectent par la vraie page (`frontend/scripts/session-test.mjs`).

## Protocole par endpoint (à suivre dans chaque lot)
1. **Figer le contrat** : schéma Zod relu ; toute modification = changement dans `packages/contracts`, front, back et mock dans la même PR.
2. **Implémenter le back** avec les tests : nominal, erreurs du catalogue, isolation, permissions.
3. **Test de conformité** : la réponse réelle (Testcontainers) et la réponse simulée passent le même schéma et exposent les mêmes codes d'erreur.
4. **Basculer** : ajouter l'id à `REAL_ENDPOINTS` (`all`, ou les espaces déjà prêts).
5. **Recette** de l'écran avec de vraies données (`/verifier-ecran` pour le rendu) ; parcours Playwright (`frontend/tests/e2e/`) mis à jour.
6. **Retirer** le handler simulé de l'endpoint à la fin du lot où il est basculé pour tous les espaces (`all`).

## En cas d'écart
| Symptôme | Cause | Réponse |
|---|---|---|
| Champ absent à l'écran | Non prévu au contrat | Ajouter au contrat (PR commune), jamais de contournement dans l'écran |
| Montant différent front/back | Calcul hors `@cotiz/domain` | Supprimer la copie, ajouter un vecteur de test |
| Bouton visible mais refusé | Permission absente de `/me` | Corriger `permissions.yaml` |
| Fonction pas encore livrée | Lot ultérieur | `features` de `/me` → « Bientôt disponible » |
| Écran V0 différent de la fiche `docs/ui/` | Maquette antérieure au « sans fournisseur » | `docs/specs/ui-deviations.md` prime, appliqué au lot indiqué |

## Correspondance écran → endpoints → lot
[../specs/screens.yaml](../specs/screens.yaml) : pour chacun des écrans, sa route (celle de `frontend/app/pages`), son nom dans `design/INVENTAIRE.md`, les endpoints qu'il consomme et le lot où il devient réel. Les fiches détaillées des écrans sont dans [../ui/](../ui/) ; le rendu attendu reste celui de `design/screens/`.
