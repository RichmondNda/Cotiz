# 06 · Conventions d'API

| Sujet | Règle |
|---|---|
| Base | REST JSON, préfixe `/api/v1`. Changement incompatible = `/api/v2`, ancienne version maintenue 6 mois |
| Préfixes | `/public`, `/auth`, `/platform`, `/associations/{aid}`, `/me`, `/uploads`, `/files` |
| JSON | `camelCase` |
| Montants | `{ "amount": 25000, "currency": "XOF" }` — entier, jamais de décimal ; formatage côté front (`formatMoney`) |
| Dates | Échéance : `"2026-10-05"` ; instant : `"2026-09-12T14:03:22Z"` |
| Identifiants | UUID v7 en chaîne |
| Listes | `{ "items": [...], "nextCursor": "…" \| null, "total": 52, "facets": { "status": { "late": 14 } } }` ; paramètres `limit` (≤ 100, défaut 25), `cursor`, `sort`, filtres nommés |
| Erreurs | `application/problem+json` (RFC 9457) avec `code` stable — catalogue dans [../specs/errors.yaml](../specs/errors.yaml) |
| Idempotence | `Idempotency-Key` exigé où l'endpoint porte le drapeau `idem` ; réponse mémorisée 24 h (Redis) ; même clé + corps différent → `idempotency_key_reused` (422) |
| Concurrence | `ETag` (`W/"<version>"`) en réponse ; `If-Match` exigé où l'endpoint porte `ifmatch` ; périmé → `version_conflict` (412) |
| Traçabilité | `X-Request-Id` accepté ou généré, renvoyé, propagé dans journaux et traces |
| Inter-tenant | Ressource d'une autre association → **404** `not_found` |
| Fonctionnalités | `GET /me` → `features` ; un endpoint dont la fonctionnalité est désactivée renvoie `feature_disabled` (403) |

## Exemple d'erreur
```json
{
  "type": "https://docs.cotiz.app/errors/allocation_mismatch",
  "title": "La répartition ne correspond pas au montant",
  "status": 422,
  "code": "allocation_mismatch",
  "detail": "Montant reçu : 75000, total réparti : 50000",
  "fields": { "allocations": "sum_must_equal_amount" },
  "requestId": "01J9…"
}
```

## Source de vérité
- Liste des endpoints, permissions, erreurs, événements, drapeaux : [../specs/endpoints.yaml](../specs/endpoints.yaml).
- Schémas de requête/réponse : `packages/contracts` (Zod), écrits au lot 0.2 à partir des écrans (`docs/ui/`) et de `endpoints.yaml`. Le document OpenAPI est **généré** depuis Zod, jamais écrit à la main.
