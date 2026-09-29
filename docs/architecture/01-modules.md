# 01 · Modules et frontières

## Style : monolithe modulaire
Une base de code NestJS, découpée en modules métier aux frontières strictes. Deux points d'entrée : `src/main.ts` (HTTP) et `src/worker.ts` (tâches).

### Couches à l'intérieur d'un module
| Couche | Dossier | Contient | Règle |
|---|---|---|---|
| Interface | `http/` | Contrôleurs, gardes, mapping contrat ↔ cas d'usage | Aucune logique métier |
| Application | `application/` | Cas d'usage (`validate-payment.use-case.ts`) | 1 cas d'usage = 1 intention = 1 transaction |
| Domaine | `domain/` | Réexporte et complète `@cotiz/domain` | Aucune dépendance NestJS, base ou HTTP |
| Infrastructure | `infra/` | Dépôts Drizzle, adaptateurs | Implémente des interfaces déclarées plus haut |
| Événements | `events/` | Événements publiés, consommateurs | Consommateurs idempotents |
| Surface publique | `<module>.public.ts` | Services exportés aux autres modules | **Seul fichier importable depuis un autre module** |

### Règles de frontière (vérifiées par dependency-cruiser en CI)
1. Un module ne lit jamais les tables d'un autre module ; il passe par son `*.public.ts`.
2. Les effets de bord (notifier, générer un PDF, invalider un cache) passent par un **événement d'outbox**, pas par un appel direct.
3. Les calculs métier (échéancier, répartition, statuts, argent) sont **uniquement** dans `@cotiz/domain`.

## Modules
| Module | Responsabilité | Tables | Lots |
|---|---|---|---|
| identity | Comptes, authentification, sessions, codes, activation, réinitialisation, 2FA | users, credentials, sessions, one_time_codes, password_reset_requests, mfa_factors | 1.1, 1.4, 3.1, 4.7 |
| access | Appartenances, rôles, permissions (`permissions.ts`) | memberships, platform_staff | 1.1, 1.2, 4.5, 4.7 |
| onboarding | Demandes de création, approbation, refus, création directe | association_requests | 1.3 |
| tenancy | Associations, profil, statut, moyens de paiement | associations, association_payment_methods | 1.2, 1.4, 2.1 |
| billing | Plans, abonnements, quotas, factures | plans, subscriptions, invoices | 1.2, 1.4, 4.6 |
| projects | Projets, cycle de vie, échéancier | projects, project_payment_methods | 2.2 |
| members | Profils souscripteurs, inscriptions, codes à remettre | subscriber_profiles, enrollments | 2.3 |
| ledger | Échéances, paiements, allocations, validation, statuts | installments, payments, allocations | 2.3, 2.4, 3.3 |
| notifications | Cloche, canaux, préférences, modèles, remises | notifications, deliveries, notification_preferences, message_templates, push_subscriptions | 2.5, 4.2 |
| reporting | Lecture seule : tableaux de bord, rapports, exports, usage | export_jobs, usage_daily (+ vues matérialisées) | 2.6, 4.6 |
| contracts | Contrats, verrouillage, signatures, PDF | contracts, contract_signatures | 4.1 |
| reminders | Règles, relances automatiques, file « À relancer » | reminder_rules, reminder_runs | 4.3 |
| imports | Import Excel/CSV en plusieurs étapes | import_jobs, import_rows | 4.4 |
| reconciliation | Relevés importés, rapprochement | bank_statements, statement_lines | 5.1 |
| developer | Clés d'API, webhooks sortants | api_keys, webhook_endpoints, webhook_deliveries | 5.2 |
| payments-online *(option)* | Prestataire agréé | payment_intents | 6.3 |

### Modules techniques (`src/shared/`)
| Module | Rôle |
|---|---|
| tenant-context | Ouvre la transaction et pose `SET LOCAL app.association_id / app.user_id / app.space` |
| outbox | Écriture d'événements dans la transaction, relais vers BullMQ |
| storage | Adaptateur S3 (MinIO) : URL présignées, antivirus, empreinte |
| audit | Décorateur `@Audited()`, écriture en ajout seul |
| channels | Interface `NotificationChannel` et canaux (in_app, push, manual ; email/sms en option) |
| crypto | Chiffrement AES-256-GCM (codes ré-affichables, secrets TOTP, secrets de webhook) |
| idempotency | Stockage Redis des réponses `Idempotency-Key` (24 h) |
