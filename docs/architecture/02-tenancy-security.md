# 02 · Isolation multi-tenant, permissions et sécurité

Une fuite de données entre associations est l'incident le plus grave possible. Trois niveaux de défense, tous obligatoires.

| Niveau | Mécanisme | Empêche |
|---|---|---|
| 1 · Route | `/associations/{aid}/…` + garde `MembershipGuard` : appartenance active avec rôle suffisant | Accès à une association dont on n'est pas membre |
| 2 · Politique | `@Can('payments.review')` évalué contre `docs/specs/permissions.yaml` | Un lecteur qui valide un paiement |
| 3 · Base | Row Level Security, contexte posé par `SET LOCAL` en début de transaction | Un filtre `WHERE` oublié |

## Contexte de requête
Chaque requête et chaque tâche du worker s'exécute dans une transaction qui commence par :
```sql
SET LOCAL app.association_id = '…';  -- espace association, ou tâche d'une association
SET LOCAL app.user_id = '…';
SET LOCAL app.space = 'association';   -- platform | association | subscriber | auth | public | system
```
- `SET LOCAL` meurt avec la transaction : compatible PgBouncer en mode transaction.
- **Aucune requête hors transaction de contexte.** L'intercepteur `TenantContextInterceptor` (API) et `withTenantContext()` (worker) sont les seuls points d'accès à la base.
- `auth` : utilisé par le module identity avant authentification (connexion, activation, réinitialisation).
- `system` : tâches du worker qui balaient plusieurs associations (statuts quotidiens, relais outbox, notifications). Jamais depuis une requête HTTP.
- `public` : formulaire de demande de création.

## Rôles PostgreSQL
| Rôle | Utilisé par | Droits |
|---|---|---|
| cotiz_migrator | Migrations | Propriétaire du schéma |
| cotiz_app | api + worker | Sans BYPASSRLS ; pas d'UPDATE/DELETE sur audit_logs et contract_signatures ; pas de DELETE sur l'argent ; pas d'INSERT/UPDATE sur plans ; pas de DELETE sur plans et subscriptions |
| cotiz_platform | Routes `/platform` du contrat, scripts qui la demandent (`seed-dev`, dev et test) | BYPASSRLS ; écritures auditées, lectures si le contrat le demande ; pas de DELETE sur plans et subscriptions ([ADR 0017](../adr/0017-acces-plateforme-if-match.md)) |
| cotiz_readonly | Rapports lourds | SELECT |

## Politiques RLS
Définies dans `docs/specs/schema.sql`. Résumé :
- **Tables d'association** (`association_id NOT NULL`) : `tenant_isolation` = `association_id = app_association_id()`.
- **Espace souscripteur** : lecture de ses lignes (`user_id = app_user_id() AND app_space() = 'subscriber'`) sur enrollments, installments, payments, allocations, contract_signatures ; projets, contrats et moyens de paiement lisibles s'il y est inscrit.
- **Tables personnelles** (notifications, préférences, abonnements push) : `user_id = app_user_id()`, écriture `system` pour le worker.
- **Tables globales sans RLS** : users, credentials, sessions, mfa_factors, platform_staff, plans, subscriber_profiles. Accès limité à leur module, couvert par des tests.
- `docs/specs/rls-smoke-test.sql` prouve le comportement attendu ; il est porté en tests Vitest + Testcontainers au lot 0.4.

## Test obligatoire en CI
Pour **chaque endpoint** de `/associations/{aid}` et `/me` : un utilisateur de l'association B tente d'accéder aux ressources de l'association A (et un souscripteur à celles d'un autre). Tous doivent renvoyer 404 (pas 403 : ne pas révéler l'existence). Une table avec `association_id` sans politique fait échouer la CI.

## Permissions
La matrice complète est dans `docs/specs/permissions.yaml`, chargée par `packages/contracts/src/permissions.ts`, exposée au front par `GET /me` pour masquer les boutons. **Le front ne fait que refléter ; la barrière est le back.**

## Quotas de plan
Vérifiés dans les cas d'usage qui créent projets, inscriptions et gestionnaires, en lisant l'abonnement (cache 5 min). Dépassement : `quota_exceeded` avec `limit` et `usage`.

## Sécurité applicative (OWASP ASVS niveau 2)
| Domaine | Mesures |
|---|---|
| Transport | TLS 1.2+ (Traefik), HSTS ; PostgreSQL, Redis, MinIO jamais exposés |
| En-têtes | CSP stricte (Nuxt), `X-Frame-Options: DENY`, `Referrer-Policy`, CORS limité au domaine |
| Entrées | Validation Zod de toutes les entrées ; SQL paramétré uniquement ; Markdown assaini |
| Accès | UUID v7 non devinables ; 404 plutôt que 403 inter-tenant ; limitation de débit par IP, utilisateur, association |
| Robots | Champ piège + ALTCHA (preuve de travail, auto-hébergé) + limitation, sur la demande de création et « mot de passe oublié » |
| Fichiers | Type réel vérifié, ClamAV, EXIF supprimé, 5 Mo max, servis par URL signée depuis un autre domaine |
| Secrets | Variables Dokploy, jamais dans Git ; clés JWT distinctes par environnement ; rotation documentée |
| Données sensibles au repos | Codes d'activation ré-affichables, secrets TOTP et de webhook chiffrés AES-256-GCM (`shared/crypto`) |
| Chaîne logicielle | Renovate, `pnpm audit`, Trivy, Semgrep en CI |
| Avant ouverture publique | Test d'intrusion sur l'isolation et le parcours de paiement |
