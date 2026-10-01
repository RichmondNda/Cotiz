# packages/contracts — source de vérité des échanges

- Registre `src/endpoints.ts` : une entrée par id de `docs/specs/endpoints.yaml` (`{ id, space, permission, flags, errors, operations: [{ method, path, request: { params, query, body }, response }] }`) ; un id regroupe une ou plusieurs opérations, drapeaux et erreurs sont portés par l'id. Un test vérifie l'égalité exacte avec le YAML (ids, méthodes, chemins, permissions, erreurs, drapeaux).
- `ErrorCode` (+ `ERRORS` : statut HTTP, message), `EndpointId`, `Permission`, `Feature`, `STATUS_LABELS` : **générés** dans `src/generated/` depuis `docs/specs/*.yaml` (`pnpm --filter contracts gen`). Ne pas les éditer à la main ; un test échoue s'ils ne sont pas à jour.
- Schémas Zod 4 en `camelCase`, à partir des types communs de `src/common/` : `Money` (`{ amount: z.int(), currency }`), `IsoDate` (`z.iso.date()`), `Instant` (`z.iso.datetime()`), `Uuid`, `listOf()`, `ListQuery`, `Problem`.
- L'OpenAPI 3.1 est généré dans `openapi.json` (`pnpm --filter contracts openapi`, à relancer après tout changement de schéma : un test échoue sinon) ; en CI, `oasdiff` compare à la branche cible et refuse les changements cassants. Page de doc : `http://localhost:4000/api/v1/docs` (api en dev).
- Client : `@cotiz/api-client`, `client.call('<id>', '<opération>', { params, query, body, ifMatch?, idempotencyKey? })`.
- Toute modification d'un schéma = une PR qui met à jour back, front et mocks ensemble.
