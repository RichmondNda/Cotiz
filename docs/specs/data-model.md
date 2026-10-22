# Dictionnaire des données

43 tables. Généré depuis `schema.sql` ; les colonnes y sont détaillées avec types, contraintes et commentaires.

| Table | Module | Lot | RLS | Description |
|---|---|---|---|---|
| `users` | identity | 1.1 | non (globale) | Toute personne qui se connecte : super-admin, gestionnaire ou souscripteur. Une seule identité par personne, quel que soit le nombre d'associations. |
| `credentials` | identity | 1.1 | non (globale) | Secrets d'authentification, séparés de l'identité pour limiter leur exposition. |
| `subscriber_profiles` | members | 2.3 | non (globale) | Informations complémentaires d'une personne en tant que souscripteur. Globales, pas propres à une association. |
| `sessions` | identity | 1.1 | non (globale) | Sessions de connexion (jetons de rafraîchissement). |
| `one_time_codes` | identity | 1.1 | tenant_manage, auth_access | Codes d'activation, de réinitialisation et d'invitation. Sans fournisseur : le code est remis par une personne (gestionnaire, super-admin). |
| `mfa_factors` | identity | 4.7 | non (globale) | Double authentification (obligatoire pour le personnel plateforme). |
| `platform_staff` | access | 1.1 | non (globale) | Personnel de la plateforme Cotiz. |
| `memberships` | access | 1.2 | tenant_isolation, self_read | Lien entre une personne et une association, avec son rôle. Un souscripteur dans deux associations = deux lignes. |
| `association_requests` | onboarding | 1.3 | public_submit | Demandes de création issues du formulaire public. |
| `associations` | tenancy | 1.2 | tenant_self, member_read, system_read | Le client de Cotiz. Racine de l'isolation multi-tenant. |
| `association_payment_methods` | tenancy | 1.2 | tenant_isolation, member_read | Comment les souscripteurs paient l'association (écran onboarding étape 3). |
| `plans` | billing | 1.2 | non (globale) | Formules d'abonnement gérées par le super-admin. |
| `subscriptions` | billing | 1.2 | tenant_isolation, system_access | Abonnement en cours d'une association. |
| `invoices` | billing | 4.6 | tenant_isolation | Factures de la plateforme aux associations. |
| `projects` | projects | 2.2 | tenant_isolation, subscriber_enrolled_read, system_access | Un projet de cotisation. |
| `project_payment_methods` | projects | 2.2 | tenant_isolation, subscriber_enrolled_read | Moyens de paiement retenus pour un projet (surcharge des moyens par défaut). |
| `enrollments` | members | 2.3 | tenant_isolation, subscriber_self_read, subscriber_sign_update, system_access | Participation d'une personne à un projet. |
| `installments` | ledger | 2.3 | tenant_isolation, subscriber_self_read, subscriber_pending_update, system_access | Échéance attendue (fonds d'entrée ou cotisation périodique). Une ligne = une case de la grille. |
| `payments` | ledger | 2.4 | tenant_isolation, subscriber_self_read, subscriber_declare | Un paiement déclaré par un souscripteur (un virement réel). |
| `allocations` | ledger | 2.4 | tenant_isolation, subscriber_self | Répartition d'un paiement sur une ou plusieurs échéances. |
| `contracts` | contracts | 4.1 | tenant_isolation, subscriber_enrolled_read | Contrat d'un projet. Immuable une fois verrouillé. |
| `contract_signatures` | contracts | 4.1 | tenant_isolation, subscriber_self_read, subscriber_sign | Contre-signature d'un souscripteur, avec éléments de preuve. |
| `import_jobs` | imports | 4.4 | tenant_isolation | Import Excel. |
| `import_rows` | imports | 4.4 | tenant_isolation | Lignes d'un import, éditables avant validation. |
| `reminder_rules` | reminders | 4.3 | tenant_isolation, system_access | Règles de relance automatique. |
| `reminder_runs` | reminders | 4.3 | tenant_isolation, system_access | Chaque relance envoyée (auto ou manuelle). |
| `notifications` | notifications | 2.5 | owner_access, system_access | Notification in-app, affichée dans la cloche. |
| `notification_preferences` | notifications | 4.2 | owner_access, system_access | Choix de canal par type et par utilisateur. |
| `message_templates` | notifications | 4.2 | platform_templates_read, tenant_templates | Modèles de messages versionnés. |
| `deliveries` | notifications | 2.5 | owner_access, system_access | Chaque envoi réel sur un canal externe. |
| `files` | storage | 0.5 | tenant_isolation, owner_access, system_access | Référentiel de tous les fichiers stockés dans MinIO. |
| `outbox_events` | outbox | 0.5 | append, relay | Événements de domaine en attente de publication. |
| `audit_logs` | audit | 0.5 | append, tenant_read, system_read | Journal d'audit, en ajout seul. |
| `export_jobs` | reporting | 4.6 | tenant_isolation | Exports CSV et PDF asynchrones. |
| `usage_daily` | reporting | 4.6 | tenant_isolation, system_access | Statistiques d'usage par association et par jour (écran super-admin). |
| `password_reset_requests` | identity | 1.1 | tenant_manage, auth_access | Demandes « mot de passe oublié ». Sans fournisseur, elles sont traitées par le rôle supérieur qui émet un code. |
| `push_subscriptions` | notifications | 4.2 | owner_access, system_access | Abonnements Web Push (protocole standard, clés VAPID propres, aucun compte chez un tiers). |
| `bank_statements` | reconciliation | 5.1 | tenant_isolation | Relevés bancaires ou mobile money importés par le gestionnaire. |
| `statement_lines` | reconciliation | 5.1 | tenant_isolation | Lignes d'un relevé et leur rapprochement. |
| `api_keys` | developer | 5.2 | tenant_isolation | Clés d'API publique par association. |
| `webhook_endpoints` | developer | 5.2 | tenant_isolation, system_access | Webhooks sortants configurés par une association. |
| `webhook_deliveries` | developer | 5.2 | tenant_isolation, system_access | Tentatives d'envoi des webhooks sortants. |
| `payment_intents` | payments_online | 6.3 | tenant_isolation, subscriber_self_read, subscriber_intent | Groupe 6.3 (option) : intentions de paiement chez un prestataire agréé. Cotiz ne détient jamais les fonds. |

## `users` — lot 1.1

Toute personne qui se connecte : super-admin, gestionnaire ou souscripteur. Une seule identité par personne, quel que soit le nombre d'associations.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` | UUID v7 (triable par date) |
| `phone_e164` | `text UNIQUE NULL` | +2250708091011 — identifiant de connexion du souscripteur, clé de dédoublonnage |
| `email` | `citext UNIQUE NULL` | identifiant de connexion gestionnaire / super-admin |
| `first_name` | `text` |  |
| `last_name` | `text` |  |
| `status` | `enum` | pending_activation · active · locked · disabled · anonymized |
| `must_change_password` | `boolean` | vrai tant que l'activation n'est pas faite |
| `locale` | `text` | fr-CI par défaut |
| `last_login_at` | `timestamptz NULL` |  |
| `created_at / updated_at` | `timestamptz` |  |
| `anonymized_at` | `timestamptz NULL` | effacement RGPD : identité remplacée, historique financier conservé |
| `version` | `int` | verrouillage optimiste |

## `credentials` — lot 1.1

Secrets d'authentification, séparés de l'identité pour limiter leur exposition.

| Colonne | Type | Note |
|---|---|---|
| `user_id` | `uuid PK FK users` |  |
| `password_hash` | `text NULL` | argon2id |
| `password_changed_at` | `timestamptz` |  |
| `failed_attempts` | `int` | remis à zéro à la connexion réussie |
| `locked_until` | `timestamptz NULL` | verrouillage 15 min après 5 échecs |

## `subscriber_profiles` — lot 2.3

Informations complémentaires d'une personne en tant que souscripteur. Globales, pas propres à une association.

| Colonne | Type | Note |
|---|---|---|
| `user_id` | `uuid PK FK users` |  |
| `address` | `text NULL` |  |
| `city` | `text NULL` |  |
| `created_by_association_id` | `uuid NULL` | association qui a créé le compte, pour traçabilité |

## `sessions` — lot 1.1

Sessions de connexion (jetons de rafraîchissement).

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `user_id` | `uuid FK` |  |
| `refresh_token_hash` | `text` | SHA-256 du jeton, jamais le jeton lui-même |
| `family_id` | `uuid` | détection de réutilisation : toute la famille est révoquée |
| `space` | `enum` | platform · association · subscriber |
| `ip / user_agent` | `inet / text` |  |
| `created_at / last_used_at / expires_at / revoked_at` | `timestamptz` |  |
| `remember_me` | `boolean` | « Rester connecté » : cookie de renouvellement persistant (30 jours) sinon de session, recopié à chaque rotation |

## `one_time_codes` — lot 1.1

Codes d'activation, de réinitialisation et d'invitation. Sans fournisseur : le code est remis par une personne (gestionnaire, super-admin).

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `user_id` | `uuid FK` |  |
| `purpose` | `enum` | activation · password_reset · staff_invite · team_invite |
| `delivery` | `enum` | manual · sms · email — manual tant que le groupe 6 n'est pas activé |
| `code_hash` | `text` | activation/invitation : 8 caractères sans ambiguïté (ex. K7M4P9QX) ; réinitialisation : 6 chiffres — toujours haché (argon2id) |
| `attempts` | `int` | maximum 5 |
| `expires_at / consumed_at` | `timestamptz` | activation 72 h, réinitialisation 15 min |
| `association_id` | `uuid NULL` | RLS : association qui a émis le code (NULL si émis par la plateforme) |
| `code_encrypted` | `bytea NULL` | activation uniquement : chiffré AES-256-GCM (clé applicative) pour ré-affichage au gestionnaire jusqu'à consommation ; effacé à la consommation ou l'expiration |
| `issued_by` | `uuid NULL FK users` | personne qui a généré le code |
| `handed_at` | `timestamptz NULL` | marqué « remis » par le gestionnaire |
| `created_at` | `timestamptz` |  |

## `mfa_factors` — lot 4.7

Double authentification (obligatoire pour le personnel plateforme).

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `user_id` | `uuid FK` |  |
| `type` | `enum` | totp |
| `secret_encrypted` | `bytea` | chiffré côté application |
| `confirmed_at` | `timestamptz` |  |

## `platform_staff` — lot 1.1

Personnel de la plateforme Cotiz.

| Colonne | Type | Note |
|---|---|---|
| `user_id` | `uuid PK FK users` |  |
| `role` | `enum` | owner · admin · support |
| `created_at` | `timestamptz` |  |

## `memberships` — lot 1.2

Lien entre une personne et une association, avec son rôle. Un souscripteur dans deux associations = deux lignes.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | colonne RLS |
| `user_id` | `uuid FK` |  |
| `role` | `enum` | owner · manager · viewer · subscriber |
| `status` | `enum` | invited · active · removed |
| `title` | `text NULL` | fonction affichée (« Trésorière ») |
| `invited_by` | `uuid NULL FK users` |  |
| `joined_at / removed_at` | `timestamptz` |  |
| `UNIQUE` | `(association_id, user_id, role)` |  |

## `association_requests` — lot 1.3

Demandes de création issues du formulaire public.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `reference` | `text UNIQUE` | DEM-2026-00042, affichée sur la confirmation |
| `association_name / type / city / country` | `text` |  |
| `registration_number` | `text NULL` |  |
| `activity_description` | `text` | 500 caractères max |
| `contact_first_name / last_name / title / email / phone` | `text` |  |
| `estimated_subscribers` | `enum` | 1_20 · 21_50 · 51_200 · 201_500 · 500_plus |
| `planned_projects` | `int NULL` |  |
| `desired_plan_id` | `uuid NULL FK plans` |  |
| `acquisition_source` | `text NULL` |  |
| `terms_accepted_at` | `timestamptz` | preuve d'acceptation des CGU |
| `status` | `enum` | pending · approved · rejected |
| `viewed_by / viewed_at` | `uuid / timestamptz` | première ouverture par la plateforme |
| `decided_by / decided_at` | `uuid / timestamptz` |  |
| `rejection_reason_code / rejection_message` | `text NULL` |  |
| `internal_note` | `text NULL` | jamais visible par la candidate |
| `association_id` | `uuid NULL FK` | association créée à l'approbation |

## `associations` — lot 1.2

Le client de Cotiz. Racine de l'isolation multi-tenant.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `slug` | `text UNIQUE` |  |
| `name / type / city / country` | `text` |  |
| `description` | `text NULL` |  |
| `logo_file_id` | `uuid NULL FK files` |  |
| `contact_email / contact_phone` | `text` |  |
| `status` | `enum` | onboarding · active · past_due · suspended · closed |
| `suspended_at / suspension_reason` | `timestamptz / text` |  |
| `currency` | `char(3)` | XOF |
| `timezone` | `text` | Africa/Abidjan |
| `default_grace_days` | `int` | délai avant « en retard » |
| `onboarding_completed_at` | `timestamptz NULL` |  |
| `version` | `int` | verrouillage optimiste |
| `created_at / updated_at` | `timestamptz` |  |

## `association_payment_methods` — lot 1.2

Comment les souscripteurs paient l'association (écran onboarding étape 3).

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `kind` | `enum` | bank_transfer · mobile_money · cash · other |
| `label` | `text` | « Orange Money », « SGBCI »… |
| `details` | `jsonb` | IBAN, banque, opérateur, numéro — schéma validé par type |
| `instructions` | `text NULL` |  |
| `position` | `int` |  |
| `is_active` | `boolean` |  |

## `plans` — lot 1.2

Formules d'abonnement gérées par le super-admin.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `code` | `text UNIQUE` |  |
| `name / description` | `text` |  |
| `price_monthly / price_yearly` | `bigint` | en XOF |
| `currency` | `char(3)` |  |
| `max_projects / max_subscribers / max_managers` | `int NULL` | NULL = illimité |
| `features` | `text[]` | clés planGated de features.yaml : contracts · imports · auto_reminders · team · exports · reconciliation · public_api · analytics |
| `is_featured / is_active` | `boolean` |  |
| `archived_at` | `timestamptz NULL` |  |
| `version` | `int` | verrouillage optimiste |

## `subscriptions` — lot 1.2

Abonnement en cours d'une association.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK UNIQUE (actif)` | RLS |
| `plan_id` | `uuid FK` |  |
| `billing_period` | `enum` | monthly · yearly |
| `status` | `enum` | trialing · active · past_due · suspended · canceled |
| `current_period_start / end` | `date` |  |
| `trial_ends_at` | `date NULL` |  |
| `manager_seats_override` | `int NULL` | surcharge décidée par le super-admin |

## `invoices` — lot 4.6

Factures de la plateforme aux associations.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `subscription_id` | `uuid FK` |  |
| `number` | `text UNIQUE` | numérotation continue, jamais réutilisée |
| `period_start / period_end` | `date` |  |
| `amount` | `bigint` |  |
| `currency` | `char(3)` |  |
| `status` | `enum` | draft · open · paid · overdue · void |
| `issued_at / due_at / paid_at` | `timestamptz` |  |
| `payment_reference` | `text NULL` |  |
| `pdf_file_id` | `uuid NULL FK files` |  |

## `projects` — lot 2.2

Un projet de cotisation.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `name` | `text` |  |
| `description` | `text` | Markdown restreint |
| `cover_file_id` | `uuid NULL` |  |
| `status` | `enum` | draft · enrolling · active · completed · archived |
| `required_subscribers` | `int NULL` | NULL = sans limite |
| `entry_fee_amount` | `bigint NULL` | fonds d'entrée |
| `installment_amount` | `bigint` | montant par échéance |
| `frequency` | `enum` | weekly · monthly · quarterly · semiannual · annual |
| `due_day` | `smallint` | jour d'échéance (ex. 5) |
| `schedule_type` | `enum` | fixed · rolling |
| `start_date / end_date` | `date / date NULL` | end_date NULL si cycle roulant |
| `grace_days` | `int` |  |
| `currency` | `char(3)` |  |
| `financial_terms_locked_at` | `timestamptz NULL` | posé au 1er paiement : montants et fréquence deviennent non modifiables |
| `created_by` | `uuid FK users` |  |
| `closed_at` | `timestamptz NULL` |  |
| `version` | `int` | verrouillage optimiste |

## `project_payment_methods` — lot 2.2

Moyens de paiement retenus pour un projet (surcharge des moyens par défaut).

| Colonne | Type | Note |
|---|---|---|
| `project_id` | `uuid FK` |  |
| `payment_method_id` | `uuid FK` |  |
| `association_id` | `uuid` | RLS |
| `instructions_override` | `text NULL` |  |

## `enrollments` — lot 2.3

Participation d'une personne à un projet.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `project_id` | `uuid FK` |  |
| `user_id` | `uuid FK` |  |
| `status` | `enum` | pending_signature · active · withdrawn · completed |
| `starts_from` | `date` | permet l'entrée en cours de projet |
| `joined_at / activated_at / withdrawn_at` | `timestamptz` |  |
| `withdrawn_by / withdraw_reason` | `uuid / text` |  |
| `UNIQUE` | `(project_id, user_id)` |  |

## `installments` — lot 2.3

Échéance attendue (fonds d'entrée ou cotisation périodique). Une ligne = une case de la grille.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `project_id / enrollment_id / user_id` | `uuid FK` | user_id dénormalisé pour l'espace souscripteur |
| `kind` | `enum` | entry_fee · periodic |
| `sequence` | `int` | 0 = entrée, puis 1, 2… |
| `due_date` | `date` | dans le fuseau de l'association |
| `amount_due` | `bigint` |  |
| `amount_paid` | `bigint` | somme des répartitions validées — maintenue en transaction |
| `amount_pending` | `bigint` | somme des répartitions déclarées non encore validées |
| `status` | `enum` | upcoming · due · declared · partial · paid · late · waived · canceled |
| `late_since` | `date NULL` |  |
| `paid_at` | `timestamptz NULL` |  |
| `CHECK` | `amount_paid ≤ amount_due` | pas de trop-perçu sur une échéance |

## `payments` — lot 2.4

Un paiement déclaré par un souscripteur (un virement réel).

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `project_id / enrollment_id / user_id` | `uuid FK` |  |
| `amount_declared` | `bigint` |  |
| `amount_received` | `bigint NULL` | saisi par le gestionnaire si différent |
| `currency` | `char(3)` |  |
| `paid_on` | `date` | date du virement selon le souscripteur |
| `payment_method_id` | `uuid NULL FK` |  |
| `transaction_reference` | `text NULL` |  |
| `proof_file_id` | `uuid NULL FK files` | preuve OU référence obligatoire |
| `comment` | `text NULL` |  |
| `status` | `enum` | pending · validated · rejected · canceled |
| `declared_at` | `timestamptz` |  |
| `reviewed_by / reviewed_at` | `uuid / timestamptz` |  |
| `rejection_reason_code / rejection_message` | `text NULL` |  |
| `idempotency_key` | `text UNIQUE` | évite les doubles déclarations sur réseau mobile instable |
| `version` | `int` | verrouillage optimiste |
| `created_at / updated_at` | `timestamptz` |  |

## `allocations` — lot 2.4

Répartition d'un paiement sur une ou plusieurs échéances.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid` | RLS |
| `payment_id` | `uuid FK` |  |
| `installment_id` | `uuid FK` |  |
| `amount` | `bigint` | > 0 |
| `state` | `enum` | proposed (par le souscripteur) · confirmed (validé) · voided |
| `UNIQUE` | `(payment_id, installment_id)` |  |

## `contracts` — lot 4.1

Contrat d'un projet. Immuable une fois verrouillé.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `project_id` | `uuid FK UNIQUE` |  |
| `body_template` | `text` | Markdown avec variables {nom_souscripteur}, {montant}… |
| `template_sha256` | `text` | empreinte du modèle verrouillé |
| `association_signer_name / title` | `text` |  |
| `association_signed_by` | `uuid FK users` |  |
| `association_signed_at / locked_at` | `timestamptz` |  |

## `contract_signatures` — lot 4.1

Contre-signature d'un souscripteur, avec éléments de preuve.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid` | RLS |
| `contract_id / enrollment_id / user_id` | `uuid FK` |  |
| `rendered_sha256` | `text` | empreinte du contrat personnalisé tel qu'affiché |
| `consent_text` | `text` | « J'ai lu et j'accepte… » exact au moment de la signature |
| `signed_at` | `timestamptz` |  |
| `ip / user_agent` | `inet / text` |  |
| `pdf_file_id` | `uuid FK files` | PDF signé avec page de preuve |

## `import_jobs` — lot 4.4

Import Excel.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id / project_id` | `uuid` | RLS |
| `source_file_id` | `uuid FK files` |  |
| `column_mapping` | `jsonb` |  |
| `status` | `enum` | uploaded · mapped · validated · importing · completed · failed |
| `counts` | `jsonb` | ready · existing · errors · duplicates · imported |
| `invite_channels` | `text[]` |  |
| `created_by` | `uuid` |  |

## `import_rows` — lot 4.4

Lignes d'un import, éditables avant validation.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `import_job_id` | `uuid FK` |  |
| `association_id` | `uuid` | RLS |
| `row_number` | `int` |  |
| `raw` | `jsonb` |  |
| `normalized` | `jsonb` |  |
| `category` | `enum` | ready · existing · error · duplicate · ignored |
| `errors` | `jsonb` |  |
| `resolved_user_id` | `uuid NULL` |  |

## `reminder_rules` — lot 4.3

Règles de relance automatique.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid` | RLS |
| `project_id` | `uuid NULL` | NULL = tous les projets |
| `trigger` | `enum` | before_due · on_due · after_due |
| `offset_days` | `int` |  |
| `channels` | `text[]` | in_app · push (sms · email seulement si le groupe 6 est activé) |
| `template_id` | `uuid FK` |  |
| `is_active` | `boolean` |  |

## `reminder_runs` — lot 4.3

Chaque relance envoyée (auto ou manuelle).

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid` | RLS |
| `rule_id` | `uuid NULL` |  |
| `installment_id / user_id` | `uuid` |  |
| `kind` | `enum` | automatic · manual |
| `triggered_by` | `uuid NULL` |  |
| `created_at` | `timestamptz` |  |
| `status` | `enum` | auto_sent · to_handle · handled · dismissed |
| `channels` | `text[]` | canaux automatiques utilisés (in_app, push) |
| `message` | `text` | message prêt à copier (rendu du modèle) |
| `handled_by / handled_at` | `uuid NULL / timestamptz NULL` | marquage dans la file « À relancer » |
| `run_date` | `date` | jour de la relance, fuseau de l'association |
| `UNIQUE` | `(rule_id, installment_id, run_date)` | idempotence quotidienne |

## `notifications` — lot 2.5

Notification in-app, affichée dans la cloche.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `user_id` | `uuid FK` |  |
| `association_id` | `uuid NULL` |  |
| `type` | `text` | payment.validated, contract.signature_required… |
| `title / body` | `text` | rendus au moment de la création |
| `action_url` | `text` | route front cible, ex. /paiements/declarer?projet=… |
| `data` | `jsonb` |  |
| `read_at` | `timestamptz NULL` |  |
| `created_at` | `timestamptz` |  |
| `dedupe_key` | `text UNIQUE NULL` | empêche les doublons |

## `notification_preferences` — lot 4.2

Choix de canal par type et par utilisateur.

| Colonne | Type | Note |
|---|---|---|
| `user_id` | `uuid` |  |
| `type` | `text` |  |
| `channel` | `enum` | in_app · push · email · sms |
| `enabled` | `boolean` |  |

## `message_templates` — lot 4.2

Modèles de messages versionnés.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid NULL` | NULL = modèle plateforme |
| `key` | `text` |  |
| `channel` | `enum` | in_app · push · email · sms · manual |
| `locale` | `text` |  |
| `subject / body` | `text` | variables Handlebars |
| `version` | `int` |  |

## `deliveries` — lot 2.5

Chaque envoi réel sur un canal externe.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `user_id` | `uuid` |  |
| `association_id` | `uuid NULL` |  |
| `notification_id` | `uuid NULL` |  |
| `channel` | `enum` | push · email · sms |
| `provider / provider_message_id` | `text / text NULL` | webpush pour le push standard ; nom de l'adaptateur pour le groupe 6 |
| `recipient_masked` | `text` | +225 07 •• •• •• 11 |
| `status` | `enum` | queued · sent · delivered · failed · bounced |
| `attempts / last_error` | `int / text` |  |
| `cost_units` | `int NULL` | coût éventuel (SMS du groupe 6) |
| `created_at / sent_at / delivered_at` | `timestamptz` |  |

## `files` — lot 0.5

Référentiel de tous les fichiers stockés dans MinIO.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid NULL` | RLS |
| `owner_user_id` | `uuid` |  |
| `purpose` | `enum` | payment_proof · contract_pdf · invoice_pdf · export · logo · cover · import_source · bank_statement |
| `bucket / object_key` | `text` | {association_id}/{purpose}/{uuid}.{ext} |
| `original_name` | `text` | nom du fichier déposé (affichage) |
| `mime_type / size_bytes` | `text / bigint` | vérifiés sur le contenu réel |
| `sha256` | `text NULL` | intégrité et preuve ; calculé par le worker, NULL tant que `scan_status = pending` (CHECK `files_sha256_when_scanned`) |
| `scan_status` | `enum` | pending · clean · infected |
| `created_at / expires_at` | `timestamptz` |  |

## `outbox_events` — lot 0.5

Événements de domaine en attente de publication.

| Colonne | Type | Note |
|---|---|---|
| `id` | `bigserial PK` |  |
| `association_id` | `uuid NULL` |  |
| `actor_user_id` | `uuid NULL` | auteur de l'action (actorUserId de l'enveloppe) ; NULL pour une tâche système |
| `event_type` | `text` | payment.validated |
| `event_version` | `int` |  |
| `aggregate_type / aggregate_id` | `text / uuid` |  |
| `payload` | `jsonb` |  |
| `occurred_at` | `timestamptz` |  |
| `published_at` | `timestamptz NULL` |  |
| `attempts` | `int` |  |

## `audit_logs` — lot 0.5

Journal d'audit, en ajout seul.

| Colonne | Type | Note |
|---|---|---|
| `id` | `bigserial PK` |  |
| `occurred_at` | `timestamptz` |  |
| `actor_user_id / actor_role` | `uuid / text` |  |
| `association_id` | `uuid NULL` |  |
| `action` | `text` | payment.validate, association.suspend… |
| `entity_type / entity_id` | `text / uuid` |  |
| `before / after` | `jsonb` | champs modifiés uniquement |
| `request_id / ip / user_agent` | `text / inet / text` |  |

## `export_jobs` — lot 4.6

Exports CSV et PDF asynchrones.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid` | RLS |
| `requested_by` | `uuid` |  |
| `kind` | `enum` | project_report_csv · project_report_pdf · members_csv |
| `params` | `jsonb` |  |
| `status` | `enum` | queued · running · done · failed |
| `file_id` | `uuid NULL` |  |

## `usage_daily` — lot 4.6

Statistiques d'usage par association et par jour (écran super-admin).

| Colonne | Type | Note |
|---|---|---|
| `association_id` | `uuid` |  |
| `day` | `date` |  |
| `logins / active_users / payments_declared / payments_validated` | `int` |  |
| `avg_validation_hours` | `numeric` |  |

## `password_reset_requests` — lot 1.1

Demandes « mot de passe oublié ». Sans fournisseur, elles sont traitées par le rôle supérieur qui émet un code.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `user_id` | `uuid FK` |  |
| `association_id` | `uuid NULL` | RLS : association du souscripteur qui traite la demande ; NULL = traité par la plateforme (gestionnaires) |
| `space` | `enum` | association · subscriber · platform |
| `status` | `enum` | pending · code_issued · completed · expired · dismissed |
| `code_id` | `uuid NULL FK one_time_codes` |  |
| `handled_by / handled_at` | `uuid NULL / timestamptz NULL` |  |
| `ip / user_agent` | `inet NULL / text NULL` |  |
| `created_at` | `timestamptz` |  |

## `push_subscriptions` — lot 4.2

Abonnements Web Push (protocole standard, clés VAPID propres, aucun compte chez un tiers).

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `user_id` | `uuid FK` |  |
| `endpoint` | `text UNIQUE` |  |
| `p256dh / auth` | `text` |  |
| `user_agent` | `text NULL` |  |
| `last_success_at` | `timestamptz NULL` |  |
| `failed_count` | `int` | désactivé après 5 échecs ou réponse 404/410 |
| `created_at` | `timestamptz` |  |
| `revoked_at` | `timestamptz NULL` |  |

## `bank_statements` — lot 5.1

Relevés bancaires ou mobile money importés par le gestionnaire.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `file_id` | `uuid FK files` |  |
| `format_key` | `text` | format reconnu (banque ou opérateur) |
| `column_mapping` | `jsonb` | mémorisé par format pour les imports suivants |
| `period_start / period_end` | `date NULL / date NULL` |  |
| `status` | `enum` | uploaded · parsed · matched · closed · failed |
| `counts` | `jsonb` | lines · proposed · confirmed · unmatched |
| `created_by` | `uuid FK users` |  |
| `created_at` | `timestamptz` |  |

## `statement_lines` — lot 5.1

Lignes d'un relevé et leur rapprochement.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `statement_id` | `uuid FK bank_statements` |  |
| `line_no` | `int` |  |
| `booked_on` | `date` |  |
| `amount` | `bigint` | crédit en unité entière |
| `currency` | `char(3)` |  |
| `reference / counterparty` | `text NULL / text NULL` |  |
| `raw` | `jsonb` |  |
| `match_payment_id` | `uuid NULL FK payments` |  |
| `match_score` | `numeric NULL` | 0 à 1 |
| `match_status` | `enum` | unmatched · proposed · confirmed · ignored |
| `UNIQUE` | `(statement_id, line_no)` |  |

## `api_keys` — lot 5.2

Clés d'API publique par association.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `name` | `text` |  |
| `prefix` | `text UNIQUE` | 8 premiers caractères, affichés |
| `key_hash` | `text` | SHA-256 de la clé, jamais la clé |
| `scopes` | `text[]` |  |
| `last_used_at` | `timestamptz NULL` |  |
| `created_by` | `uuid FK users` |  |
| `created_at` | `timestamptz` |  |
| `revoked_at` | `timestamptz NULL` |  |

## `webhook_endpoints` — lot 5.2

Webhooks sortants configurés par une association.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `url` | `text` | HTTPS uniquement |
| `secret_encrypted` | `bytea` | signature HMAC-SHA256 |
| `events` | `text[]` |  |
| `is_active` | `boolean` |  |
| `created_at` | `timestamptz` |  |

## `webhook_deliveries` — lot 5.2

Tentatives d'envoi des webhooks sortants.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `endpoint_id` | `uuid FK webhook_endpoints` |  |
| `event_id` | `bigint` | outbox_events.id |
| `status` | `enum` | pending · succeeded · failed · abandoned |
| `attempts` | `int` |  |
| `last_status_code` | `int NULL` |  |
| `next_attempt_at` | `timestamptz NULL` |  |
| `created_at` | `timestamptz` |  |

## `payment_intents` — lot 6.3

Groupe 6.3 (option) : intentions de paiement chez un prestataire agréé. Cotiz ne détient jamais les fonds.

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid PK` |  |
| `association_id` | `uuid FK` | RLS |
| `user_id` | `uuid FK` |  |
| `provider / provider_ref` | `text / text NULL` |  |
| `amount` | `bigint` |  |
| `currency` | `char(3)` |  |
| `allocations` | `jsonb` | répartition demandée |
| `status` | `enum` | created · pending · succeeded · failed · expired |
| `payment_id` | `uuid NULL FK payments` | paiement créé à la confirmation |
| `idempotency_key` | `text UNIQUE` |  |
| `created_at / updated_at` | `timestamptz` |  |
