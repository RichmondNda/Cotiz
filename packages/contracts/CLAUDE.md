# packages/contracts — source de vérité des échanges

- Registre `src/endpoints.ts` : une entrée par id de `docs/specs/endpoints.yaml` (`{ id, method, path, permission, flags, request: { params, query, body }, response, errors }`). Un test vérifie l'égalité exacte avec le YAML (ids, méthodes, chemins, permissions, erreurs, drapeaux).
- `ErrorCode`, `EndpointId`, `Permission`, `Feature`, libellés de statut : **générés** depuis `docs/specs/*.yaml` (`pnpm --filter contracts gen`). Ne pas les éditer à la main.
- Schémas Zod en `camelCase` ; montants `{ amount: z.number().int(), currency }` ; dates `z.string().date()` / instants `z.string().datetime()`.
- L'OpenAPI 3.1 est généré dans `openapi.json` ; `oasdiff` en CI refuse les changements cassants.
- Toute modification d'un schéma = une PR qui met à jour back, front et mocks ensemble.
