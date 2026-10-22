-- =====================================================================
-- Cotiz — schéma de référence PostgreSQL 16
-- Généré depuis la spécification (docs/specs). Ce fichier est la CIBLE :
-- les migrations Drizzle de packages/db doivent produire un schéma équivalent.
-- Lot par lot : chaque table indique le lot qui la crée (commentaire « lot x.y »).
-- Ne pas exécuter tel quel en production : le découper en migrations par lot.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Identifiants : UUID v7 générés par l'application (packages/domain/ids.ts),
-- pas de DEFAULT côté base (PostgreSQL 16 n'a pas uuidv7()).

-- ---------------------------------------------------------------------
-- Contexte de requête (posé par shared/tenant-context avec SET LOCAL)
--   app.association_id : association courante (espace gestionnaire, tâches d'une association)
--   app.user_id        : utilisateur courant
--   app.space          : platform | association | subscriber | auth | public | system
-- ---------------------------------------------------------------------
CREATE FUNCTION app_association_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.association_id', true), '')::uuid $$;
CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE FUNCTION app_space() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('app.space', true), ''), 'none') $$;

-- ---------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------
CREATE TYPE users_status AS ENUM ('pending_activation', 'active', 'locked', 'disabled', 'anonymized');
CREATE TYPE sessions_space AS ENUM ('platform', 'association', 'subscriber');
CREATE TYPE one_time_codes_purpose AS ENUM ('activation', 'password_reset', 'staff_invite', 'team_invite');
CREATE TYPE one_time_codes_delivery AS ENUM ('manual', 'sms', 'email');
CREATE TYPE mfa_factors_type AS ENUM ('totp');
CREATE TYPE platform_staff_role AS ENUM ('owner', 'admin', 'support');
CREATE TYPE memberships_role AS ENUM ('owner', 'manager', 'viewer', 'subscriber');
CREATE TYPE memberships_status AS ENUM ('invited', 'active', 'removed');
CREATE TYPE association_requests_estimated_subscribers AS ENUM ('1_20', '21_50', '51_200', '201_500', '500_plus');
CREATE TYPE association_requests_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE associations_status AS ENUM ('onboarding', 'active', 'past_due', 'suspended', 'closed');
CREATE TYPE association_payment_methods_kind AS ENUM ('bank_transfer', 'mobile_money', 'cash', 'other');
CREATE TYPE subscriptions_billing_period AS ENUM ('monthly', 'yearly');
CREATE TYPE subscriptions_status AS ENUM ('trialing', 'active', 'past_due', 'suspended', 'canceled');
CREATE TYPE invoices_status AS ENUM ('draft', 'open', 'paid', 'overdue', 'void');
CREATE TYPE projects_status AS ENUM ('draft', 'enrolling', 'active', 'completed', 'archived');
CREATE TYPE projects_frequency AS ENUM ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual');
CREATE TYPE projects_schedule_type AS ENUM ('fixed', 'rolling');
CREATE TYPE enrollments_status AS ENUM ('pending_signature', 'active', 'withdrawn', 'completed');
CREATE TYPE installments_kind AS ENUM ('entry_fee', 'periodic');
CREATE TYPE installments_status AS ENUM ('upcoming', 'due', 'declared', 'partial', 'paid', 'late', 'waived', 'canceled');
CREATE TYPE payments_status AS ENUM ('pending', 'validated', 'rejected', 'canceled');
CREATE TYPE allocations_state AS ENUM ('proposed', 'confirmed', 'voided');
CREATE TYPE import_jobs_status AS ENUM ('uploaded', 'mapped', 'validated', 'importing', 'completed', 'failed');
CREATE TYPE import_rows_category AS ENUM ('ready', 'existing', 'error', 'duplicate', 'ignored');
CREATE TYPE reminder_rules_trigger AS ENUM ('before_due', 'on_due', 'after_due');
CREATE TYPE reminder_runs_kind AS ENUM ('automatic', 'manual');
CREATE TYPE reminder_runs_status AS ENUM ('auto_sent', 'to_handle', 'handled', 'dismissed');
CREATE TYPE notification_channel AS ENUM ('in_app', 'push', 'email', 'sms');
CREATE TYPE template_channel AS ENUM ('in_app', 'push', 'email', 'sms', 'manual');
CREATE TYPE delivery_channel AS ENUM ('push', 'email', 'sms');
CREATE TYPE deliveries_status AS ENUM ('queued', 'sent', 'delivered', 'failed', 'bounced');
CREATE TYPE files_purpose AS ENUM ('payment_proof', 'contract_pdf', 'invoice_pdf', 'export', 'logo', 'cover', 'import_source', 'bank_statement');
CREATE TYPE files_scan_status AS ENUM ('pending', 'clean', 'infected');
CREATE TYPE export_jobs_kind AS ENUM ('project_report_csv', 'project_report_pdf', 'members_csv');
CREATE TYPE export_jobs_status AS ENUM ('queued', 'running', 'done', 'failed');
CREATE TYPE password_reset_requests_space AS ENUM ('association', 'subscriber', 'platform');
CREATE TYPE password_reset_requests_status AS ENUM ('pending', 'code_issued', 'completed', 'expired', 'dismissed');
CREATE TYPE bank_statements_status AS ENUM ('uploaded', 'parsed', 'matched', 'closed', 'failed');
CREATE TYPE statement_lines_match_status AS ENUM ('unmatched', 'proposed', 'confirmed', 'ignored');
CREATE TYPE webhook_deliveries_status AS ENUM ('pending', 'succeeded', 'failed', 'abandoned');
CREATE TYPE payment_intents_status AS ENUM ('created', 'pending', 'succeeded', 'failed', 'expired');

-- ---------------------------------------------------------------------
-- Tables (ordre : par module ; les clés étrangères sont ajoutées après)
-- ---------------------------------------------------------------------

-- users · module identity · V1 · lot 1.1
-- Toute personne qui se connecte : super-admin, gestionnaire ou souscripteur. Une seule identité par personne, quel que soit le nombre d'associations.
CREATE TABLE users (
  id uuid PRIMARY KEY,
  phone_e164 text UNIQUE,
  email citext UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  status users_status NOT NULL DEFAULT 'pending_activation',
  must_change_password boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'fr-CI',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  anonymized_at timestamptz,
  version int NOT NULL DEFAULT 1
);
COMMENT ON TABLE users IS 'Toute personne qui se connecte : super-admin, gestionnaire ou souscripteur. Une seule identité par personne, quel que soit le nombre d''associations.';
COMMENT ON COLUMN users.id IS 'UUID v7 (triable par date)';
COMMENT ON COLUMN users.phone_e164 IS '+2250708091011 — identifiant de connexion du souscripteur, clé de dédoublonnage';
COMMENT ON COLUMN users.email IS 'identifiant de connexion gestionnaire / super-admin';
COMMENT ON COLUMN users.status IS 'pending_activation · active · locked · disabled · anonymized';
COMMENT ON COLUMN users.must_change_password IS 'vrai tant que l''activation n''est pas faite';
COMMENT ON COLUMN users.locale IS 'fr-CI par défaut';
COMMENT ON COLUMN users.anonymized_at IS 'effacement RGPD : identité remplacée, historique financier conservé';
COMMENT ON COLUMN users.version IS 'verrouillage optimiste';

-- credentials · module identity · V1 · lot 1.1
-- Secrets d'authentification, séparés de l'identité pour limiter leur exposition.
CREATE TABLE credentials (
  user_id uuid PRIMARY KEY,
  password_hash text,
  password_changed_at timestamptz,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz
);
COMMENT ON TABLE credentials IS 'Secrets d''authentification, séparés de l''identité pour limiter leur exposition.';
COMMENT ON COLUMN credentials.password_hash IS 'argon2id';
COMMENT ON COLUMN credentials.failed_attempts IS 'remis à zéro à la connexion réussie';
COMMENT ON COLUMN credentials.locked_until IS 'verrouillage 15 min après 5 échecs';

-- subscriber_profiles · module members · V1 · lot 2.3
-- Informations complémentaires d'une personne en tant que souscripteur. Globales, pas propres à une association.
CREATE TABLE subscriber_profiles (
  user_id uuid PRIMARY KEY,
  address text,
  city text,
  created_by_association_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE subscriber_profiles IS 'Informations complémentaires d''une personne en tant que souscripteur. Globales, pas propres à une association.';
COMMENT ON COLUMN subscriber_profiles.created_by_association_id IS 'association qui a créé le compte, pour traçabilité';

-- sessions · module identity · V1 · lot 1.1
-- Sessions de connexion (jetons de rafraîchissement).
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  refresh_token_hash text NOT NULL,
  family_id uuid NOT NULL,
  space sessions_space NOT NULL,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  remember_me boolean NOT NULL DEFAULT false
);
COMMENT ON TABLE sessions IS 'Sessions de connexion (jetons de rafraîchissement).';
COMMENT ON COLUMN sessions.refresh_token_hash IS 'SHA-256 du jeton, jamais le jeton lui-même';
COMMENT ON COLUMN sessions.family_id IS 'détection de réutilisation : toute la famille est révoquée';
COMMENT ON COLUMN sessions.space IS 'platform · association · subscriber';
COMMENT ON COLUMN sessions.remember_me IS '« Rester connecté » : cookie de renouvellement persistant (30 jours) sinon de session, recopié à chaque rotation';

-- one_time_codes · module identity · V1 · lot 1.1
-- Codes d'activation, de réinitialisation et d'invitation. Sans fournisseur : le code est remis par une personne (gestionnaire, super-admin).
CREATE TABLE one_time_codes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  purpose one_time_codes_purpose NOT NULL,
  delivery one_time_codes_delivery NOT NULL DEFAULT 'manual',
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  association_id uuid,
  code_encrypted bytea,
  issued_by uuid,
  handed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE one_time_codes IS 'Codes d''activation, de réinitialisation et d''invitation. Sans fournisseur : le code est remis par une personne (gestionnaire, super-admin).';
COMMENT ON COLUMN one_time_codes.purpose IS 'activation · password_reset · staff_invite · team_invite';
COMMENT ON COLUMN one_time_codes.delivery IS 'manual · sms · email — manual tant que le groupe 6 n''est pas activé';
COMMENT ON COLUMN one_time_codes.code_hash IS 'activation/invitation : 8 caractères sans ambiguïté (ex. K7M4P9QX) ; réinitialisation : 6 chiffres — toujours haché (argon2id)';
COMMENT ON COLUMN one_time_codes.attempts IS 'maximum 5';
COMMENT ON COLUMN one_time_codes.expires_at IS 'activation 72 h, réinitialisation 15 min';
COMMENT ON COLUMN one_time_codes.consumed_at IS 'activation 72 h, réinitialisation 15 min';
COMMENT ON COLUMN one_time_codes.association_id IS 'RLS : association qui a émis le code (NULL si émis par la plateforme)';
COMMENT ON COLUMN one_time_codes.code_encrypted IS 'activation uniquement : chiffré AES-256-GCM (clé applicative) pour ré-affichage au gestionnaire jusqu''à consommation ; effacé à la consommation ou l''expiration';
COMMENT ON COLUMN one_time_codes.issued_by IS 'personne qui a généré le code';
COMMENT ON COLUMN one_time_codes.handed_at IS 'marqué « remis » par le gestionnaire';

-- mfa_factors · module identity · V2 · lot 4.7
-- Double authentification (obligatoire pour le personnel plateforme).
CREATE TABLE mfa_factors (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  type mfa_factors_type NOT NULL,
  secret_encrypted bytea NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE mfa_factors IS 'Double authentification (obligatoire pour le personnel plateforme).';
COMMENT ON COLUMN mfa_factors.type IS 'totp';
COMMENT ON COLUMN mfa_factors.secret_encrypted IS 'chiffré côté application';

-- platform_staff · module access · V1 · lot 1.1
-- Personnel de la plateforme Cotiz.
CREATE TABLE platform_staff (
  user_id uuid PRIMARY KEY,
  role platform_staff_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE platform_staff IS 'Personnel de la plateforme Cotiz.';
COMMENT ON COLUMN platform_staff.role IS 'owner · admin · support';

-- memberships · module access · V1 · lot 1.2
-- Lien entre une personne et une association, avec son rôle. Un souscripteur dans deux associations = deux lignes.
CREATE TABLE memberships (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role memberships_role NOT NULL,
  status memberships_status NOT NULL DEFAULT 'invited',
  title text,
  invited_by uuid,
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (association_id, user_id, role)
);
COMMENT ON TABLE memberships IS 'Lien entre une personne et une association, avec son rôle. Un souscripteur dans deux associations = deux lignes.';
COMMENT ON COLUMN memberships.association_id IS 'colonne RLS';
COMMENT ON COLUMN memberships.role IS 'owner · manager · viewer · subscriber';
COMMENT ON COLUMN memberships.status IS 'invited · active · removed';
COMMENT ON COLUMN memberships.title IS 'fonction affichée (« Trésorière »), facultative';

-- association_requests · module onboarding · V1 · lot 1.3
-- Demandes de création issues du formulaire public.
CREATE TABLE association_requests (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  association_name text NOT NULL,
  association_type text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  registration_number text,
  activity_description text NOT NULL,
  contact_first_name text NOT NULL,
  contact_last_name text NOT NULL,
  contact_title text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  estimated_subscribers association_requests_estimated_subscribers NOT NULL,
  planned_projects int,
  desired_plan_id uuid,
  acquisition_source text,
  terms_accepted_at timestamptz NOT NULL,
  status association_requests_status NOT NULL DEFAULT 'pending',
  viewed_by uuid,
  viewed_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  rejection_reason_code text,
  rejection_message text,
  internal_note text,
  association_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE association_requests IS 'Demandes de création issues du formulaire public.';
COMMENT ON COLUMN association_requests.reference IS 'DEM-2026-00042, affichée sur la confirmation';
COMMENT ON COLUMN association_requests.activity_description IS '500 caractères max';
COMMENT ON COLUMN association_requests.estimated_subscribers IS '1_20 · 21_50 · 51_200 · 201_500 · 500_plus';
COMMENT ON COLUMN association_requests.terms_accepted_at IS 'preuve d''acceptation des CGU';
COMMENT ON COLUMN association_requests.status IS 'pending · approved · rejected';
COMMENT ON COLUMN association_requests.viewed_at IS 'première ouverture par la plateforme (frise « Consultée »)';
COMMENT ON COLUMN association_requests.internal_note IS 'jamais visible par la candidate';
COMMENT ON COLUMN association_requests.association_id IS 'association créée à l''approbation';

-- associations · module tenancy · V1 · lot 1.2
-- Le client de Cotiz. Racine de l'isolation multi-tenant.
CREATE TABLE associations (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  description text,
  logo_file_id uuid,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  status associations_status NOT NULL DEFAULT 'onboarding',
  suspended_at timestamptz,
  suspension_reason text,
  currency char(3) NOT NULL DEFAULT 'XOF',
  timezone text NOT NULL DEFAULT 'Africa/Abidjan',
  default_grace_days int NOT NULL DEFAULT 5,
  onboarding_completed_at timestamptz,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE associations IS 'Le client de Cotiz. Racine de l''isolation multi-tenant.';
COMMENT ON COLUMN associations.status IS 'onboarding · active · past_due · suspended · closed';
COMMENT ON COLUMN associations.currency IS 'XOF';
COMMENT ON COLUMN associations.timezone IS 'Africa/Abidjan';
COMMENT ON COLUMN associations.default_grace_days IS 'délai avant « en retard »';
COMMENT ON COLUMN associations.version IS 'verrouillage optimiste';

-- association_payment_methods · module tenancy · V1 · lot 1.2
-- Comment les souscripteurs paient l'association (écran onboarding étape 3).
CREATE TABLE association_payment_methods (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  kind association_payment_methods_kind NOT NULL,
  label text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  instructions text,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE association_payment_methods IS 'Comment les souscripteurs paient l''association (écran onboarding étape 3).';
COMMENT ON COLUMN association_payment_methods.association_id IS 'RLS';
COMMENT ON COLUMN association_payment_methods.kind IS 'bank_transfer · mobile_money · cash · other';
COMMENT ON COLUMN association_payment_methods.label IS '« Orange Money », « SGBCI »…';
COMMENT ON COLUMN association_payment_methods.details IS 'IBAN, banque, opérateur, numéro — schéma validé par type';

-- plans · module billing · V1 · lot 1.2
-- Formules d'abonnement gérées par le super-admin.
CREATE TABLE plans (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_monthly bigint NOT NULL,
  price_yearly bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'XOF',
  max_projects int,
  max_subscribers int,
  max_managers int,
  features text[] NOT NULL,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE plans IS 'Formules d''abonnement gérées par le super-admin.';
COMMENT ON COLUMN plans.price_monthly IS 'en XOF';
COMMENT ON COLUMN plans.price_yearly IS 'en XOF';
COMMENT ON COLUMN plans.max_projects IS 'NULL = illimité';
COMMENT ON COLUMN plans.max_subscribers IS 'NULL = illimité';
COMMENT ON COLUMN plans.max_managers IS 'NULL = illimité';
COMMENT ON COLUMN plans.features IS 'clés planGated de features.yaml : contracts · imports · auto_reminders · team · exports · reconciliation · public_api · analytics';
COMMENT ON COLUMN plans.version IS 'verrouillage optimiste';

-- subscriptions · module billing · V1 · lot 1.2
-- Abonnement en cours d'une association.
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  billing_period subscriptions_billing_period NOT NULL,
  status subscriptions_status NOT NULL DEFAULT 'trialing',
  current_period_start date NOT NULL,
  current_period_end date,
  trial_ends_at date,
  manager_seats_override int,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE subscriptions IS 'Abonnement en cours d''une association.';
COMMENT ON COLUMN subscriptions.association_id IS 'RLS';
COMMENT ON COLUMN subscriptions.billing_period IS 'monthly · yearly';
COMMENT ON COLUMN subscriptions.status IS 'trialing · active · past_due · suspended · canceled';
COMMENT ON COLUMN subscriptions.manager_seats_override IS 'surcharge décidée par le super-admin';

-- invoices · module billing · V2 · lot 4.6
-- Factures de la plateforme aux associations.
CREATE TABLE invoices (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  number text NOT NULL UNIQUE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'XOF',
  status invoices_status NOT NULL DEFAULT 'draft',
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  pdf_file_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE invoices IS 'Factures de la plateforme aux associations.';
COMMENT ON COLUMN invoices.association_id IS 'RLS';
COMMENT ON COLUMN invoices.number IS 'numérotation continue, jamais réutilisée';
COMMENT ON COLUMN invoices.status IS 'draft · open · paid · overdue · void';

-- projects · module projects · V1 · lot 2.2
-- Un projet de cotisation.
CREATE TABLE projects (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  cover_file_id uuid,
  status projects_status NOT NULL DEFAULT 'draft',
  required_subscribers int,
  entry_fee_amount bigint,
  installment_amount bigint NOT NULL,
  frequency projects_frequency NOT NULL,
  due_day smallint NOT NULL,
  schedule_type projects_schedule_type NOT NULL,
  start_date date NOT NULL,
  end_date date,
  grace_days int NOT NULL DEFAULT 5,
  currency char(3) NOT NULL DEFAULT 'XOF',
  financial_terms_locked_at timestamptz,
  created_by uuid NOT NULL,
  closed_at timestamptz,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE projects IS 'Un projet de cotisation.';
COMMENT ON COLUMN projects.association_id IS 'RLS';
COMMENT ON COLUMN projects.description IS 'Markdown restreint';
COMMENT ON COLUMN projects.status IS 'draft · enrolling · active · completed · archived';
COMMENT ON COLUMN projects.required_subscribers IS 'NULL = sans limite';
COMMENT ON COLUMN projects.entry_fee_amount IS 'fonds d''entrée';
COMMENT ON COLUMN projects.installment_amount IS 'montant par échéance';
COMMENT ON COLUMN projects.frequency IS 'weekly · monthly · quarterly · semiannual · annual';
COMMENT ON COLUMN projects.due_day IS 'jour d''échéance (ex. 5)';
COMMENT ON COLUMN projects.schedule_type IS 'fixed · rolling';
COMMENT ON COLUMN projects.end_date IS 'end_date NULL si cycle roulant';
COMMENT ON COLUMN projects.financial_terms_locked_at IS 'posé au 1er paiement : montants et fréquence deviennent non modifiables';
COMMENT ON COLUMN projects.version IS 'verrouillage optimiste';

-- project_payment_methods · module projects · V1 · lot 2.2
-- Moyens de paiement retenus pour un projet (surcharge des moyens par défaut).
CREATE TABLE project_payment_methods (
  project_id uuid NOT NULL,
  payment_method_id uuid NOT NULL,
  association_id uuid NOT NULL,
  instructions_override text,
  PRIMARY KEY (project_id, payment_method_id)
);
COMMENT ON TABLE project_payment_methods IS 'Moyens de paiement retenus pour un projet (surcharge des moyens par défaut).';
COMMENT ON COLUMN project_payment_methods.association_id IS 'RLS';

-- enrollments · module members · V1 · lot 2.3
-- Participation d'une personne à un projet.
CREATE TABLE enrollments (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status enrollments_status NOT NULL DEFAULT 'pending_signature',
  starts_from date NOT NULL,
  joined_at timestamptz NOT NULL,
  activated_at timestamptz,
  withdrawn_at timestamptz,
  withdrawn_by uuid,
  withdraw_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
COMMENT ON TABLE enrollments IS 'Participation d''une personne à un projet.';
COMMENT ON COLUMN enrollments.association_id IS 'RLS';
COMMENT ON COLUMN enrollments.status IS 'pending_signature · active · withdrawn · completed';
COMMENT ON COLUMN enrollments.starts_from IS 'permet l''entrée en cours de projet';

-- installments · module ledger · V1 · lot 2.3
-- Échéance attendue (fonds d'entrée ou cotisation périodique). Une ligne = une case de la grille.
CREATE TABLE installments (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  project_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind installments_kind NOT NULL,
  sequence int NOT NULL,
  due_date date NOT NULL,
  amount_due bigint NOT NULL,
  amount_paid bigint NOT NULL DEFAULT 0,
  amount_pending bigint NOT NULL DEFAULT 0,
  status installments_status NOT NULL DEFAULT 'upcoming',
  late_since date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount_paid <= amount_due)
);
COMMENT ON TABLE installments IS 'Échéance attendue (fonds d''entrée ou cotisation périodique). Une ligne = une case de la grille.';
COMMENT ON COLUMN installments.association_id IS 'RLS';
COMMENT ON COLUMN installments.user_id IS 'user_id dénormalisé pour l''espace souscripteur';
COMMENT ON COLUMN installments.kind IS 'entry_fee · periodic';
COMMENT ON COLUMN installments.sequence IS '0 = entrée, puis 1, 2…';
COMMENT ON COLUMN installments.due_date IS 'dans le fuseau de l''association';
COMMENT ON COLUMN installments.amount_paid IS 'somme des répartitions validées — maintenue en transaction';
COMMENT ON COLUMN installments.amount_pending IS 'somme des répartitions déclarées non encore validées';
COMMENT ON COLUMN installments.status IS 'upcoming · due · declared · partial · paid · late · waived · canceled';

-- payments · module ledger · V1 · lot 2.4
-- Un paiement déclaré par un souscripteur (un virement réel).
CREATE TABLE payments (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  project_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  amount_declared bigint NOT NULL,
  amount_received bigint,
  currency char(3) NOT NULL DEFAULT 'XOF',
  paid_on date NOT NULL,
  payment_method_id uuid,
  transaction_reference text,
  proof_file_id uuid,
  comment text,
  status payments_status NOT NULL DEFAULT 'pending',
  declared_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason_code text,
  rejection_message text,
  idempotency_key text NOT NULL UNIQUE,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payments IS 'Un paiement déclaré par un souscripteur (un virement réel).';
COMMENT ON COLUMN payments.association_id IS 'RLS';
COMMENT ON COLUMN payments.amount_received IS 'saisi par le gestionnaire si différent';
COMMENT ON COLUMN payments.paid_on IS 'date du virement selon le souscripteur';
COMMENT ON COLUMN payments.proof_file_id IS 'preuve OU référence obligatoire';
COMMENT ON COLUMN payments.status IS 'pending · validated · rejected · canceled';
COMMENT ON COLUMN payments.idempotency_key IS 'évite les doubles déclarations sur réseau mobile instable';
COMMENT ON COLUMN payments.version IS 'verrouillage optimiste';

-- allocations · module ledger · V1 · lot 2.4
-- Répartition d'un paiement sur une ou plusieurs échéances.
CREATE TABLE allocations (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  installment_id uuid NOT NULL,
  amount bigint NOT NULL,
  state allocations_state NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, installment_id),
  CHECK (amount > 0)
);
COMMENT ON TABLE allocations IS 'Répartition d''un paiement sur une ou plusieurs échéances.';
COMMENT ON COLUMN allocations.association_id IS 'RLS';
COMMENT ON COLUMN allocations.amount IS '> 0';
COMMENT ON COLUMN allocations.state IS 'proposed (par le souscripteur) · confirmed (validé) · voided';

-- contracts · module contracts · V2 · lot 4.1
-- Contrat d'un projet. Immuable une fois verrouillé.
CREATE TABLE contracts (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  project_id uuid NOT NULL UNIQUE,
  body_template text NOT NULL,
  template_sha256 text NOT NULL,
  association_signer_name text NOT NULL,
  association_signer_title text NOT NULL,
  association_signed_by uuid,
  association_signed_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE contracts IS 'Contrat d''un projet. Immuable une fois verrouillé.';
COMMENT ON COLUMN contracts.association_id IS 'RLS';
COMMENT ON COLUMN contracts.body_template IS 'Markdown avec variables {nom_souscripteur}, {montant}…';
COMMENT ON COLUMN contracts.template_sha256 IS 'empreinte du modèle verrouillé';

-- contract_signatures · module contracts · V2 · lot 4.1
-- Contre-signature d'un souscripteur, avec éléments de preuve.
CREATE TABLE contract_signatures (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rendered_sha256 text NOT NULL,
  consent_text text NOT NULL,
  signed_at timestamptz NOT NULL,
  ip inet,
  user_agent text,
  pdf_file_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE contract_signatures IS 'Contre-signature d''un souscripteur, avec éléments de preuve.';
COMMENT ON COLUMN contract_signatures.association_id IS 'RLS';
COMMENT ON COLUMN contract_signatures.rendered_sha256 IS 'empreinte du contrat personnalisé tel qu''affiché';
COMMENT ON COLUMN contract_signatures.consent_text IS '« J''ai lu et j''accepte… » exact au moment de la signature';
COMMENT ON COLUMN contract_signatures.pdf_file_id IS 'PDF signé avec page de preuve';

-- import_jobs · module imports · V2 · lot 4.4
-- Import Excel.
CREATE TABLE import_jobs (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  project_id uuid NOT NULL,
  source_file_id uuid NOT NULL,
  column_mapping jsonb NOT NULL,
  status import_jobs_status NOT NULL DEFAULT 'uploaded',
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  invite_channels text[] NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE import_jobs IS 'Import Excel.';
COMMENT ON COLUMN import_jobs.association_id IS 'RLS';
COMMENT ON COLUMN import_jobs.project_id IS 'RLS';
COMMENT ON COLUMN import_jobs.status IS 'uploaded · mapped · validated · importing · completed · failed';
COMMENT ON COLUMN import_jobs.counts IS 'ready · existing · errors · duplicates · imported';

-- import_rows · module imports · V2 · lot 4.4
-- Lignes d'un import, éditables avant validation.
CREATE TABLE import_rows (
  id uuid PRIMARY KEY,
  import_job_id uuid NOT NULL,
  association_id uuid NOT NULL,
  row_number int NOT NULL,
  raw jsonb NOT NULL,
  normalized jsonb,
  category import_rows_category NOT NULL,
  errors jsonb DEFAULT '[]'::jsonb,
  resolved_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE import_rows IS 'Lignes d''un import, éditables avant validation.';
COMMENT ON COLUMN import_rows.association_id IS 'RLS';
COMMENT ON COLUMN import_rows.category IS 'ready · existing · error · duplicate · ignored';

-- reminder_rules · module reminders · V2 · lot 4.3
-- Règles de relance automatique.
CREATE TABLE reminder_rules (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  project_id uuid,
  trigger reminder_rules_trigger NOT NULL,
  offset_days int NOT NULL,
  channels text[] NOT NULL,
  template_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE reminder_rules IS 'Règles de relance automatique.';
COMMENT ON COLUMN reminder_rules.association_id IS 'RLS';
COMMENT ON COLUMN reminder_rules.project_id IS 'NULL = tous les projets';
COMMENT ON COLUMN reminder_rules.trigger IS 'before_due · on_due · after_due';
COMMENT ON COLUMN reminder_rules.channels IS 'in_app · push (sms · email seulement si le groupe 6 est activé)';

-- reminder_runs · module reminders · V2 · lot 4.3
-- Chaque relance envoyée (auto ou manuelle).
CREATE TABLE reminder_runs (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  rule_id uuid,
  installment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind reminder_runs_kind NOT NULL,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  status reminder_runs_status NOT NULL DEFAULT 'auto_sent',
  channels text[] NOT NULL,
  message text,
  handled_by uuid,
  handled_at timestamptz,
  run_date date NOT NULL,
  UNIQUE (rule_id, installment_id, run_date)
);
COMMENT ON TABLE reminder_runs IS 'Chaque relance envoyée (auto ou manuelle).';
COMMENT ON COLUMN reminder_runs.association_id IS 'RLS';
COMMENT ON COLUMN reminder_runs.kind IS 'automatic · manual';
COMMENT ON COLUMN reminder_runs.status IS 'auto_sent · to_handle · handled · dismissed';
COMMENT ON COLUMN reminder_runs.channels IS 'canaux automatiques utilisés (in_app, push)';
COMMENT ON COLUMN reminder_runs.message IS 'message prêt à copier (rendu du modèle)';
COMMENT ON COLUMN reminder_runs.handled_by IS 'marquage dans la file « À relancer »';
COMMENT ON COLUMN reminder_runs.handled_at IS 'marquage dans la file « À relancer »';
COMMENT ON COLUMN reminder_runs.run_date IS 'jour de la relance, fuseau de l''association';

-- notifications · module notifications · V1 (table) · V2 (écrans) · lot 2.5
-- Notification in-app, affichée dans la cloche.
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  association_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text UNIQUE
);
COMMENT ON TABLE notifications IS 'Notification in-app, affichée dans la cloche.';
COMMENT ON COLUMN notifications.type IS 'payment.validated, contract.signature_required…';
COMMENT ON COLUMN notifications.title IS 'rendus au moment de la création';
COMMENT ON COLUMN notifications.body IS 'rendus au moment de la création';
COMMENT ON COLUMN notifications.action_url IS 'route front cible, ex. /paiements/declarer?projet=…';
COMMENT ON COLUMN notifications.dedupe_key IS 'empêche les doublons';

-- notification_preferences · module notifications · V2 · lot 4.2
-- Choix de canal par type et par utilisateur.
CREATE TABLE notification_preferences (
  user_id uuid NOT NULL,
  type text NOT NULL,
  channel notification_channel NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, type, channel)
);
COMMENT ON TABLE notification_preferences IS 'Choix de canal par type et par utilisateur.';
COMMENT ON COLUMN notification_preferences.channel IS 'in_app · push · email · sms';

-- message_templates · module notifications · V2 · lot 4.2
-- Modèles de messages versionnés.
CREATE TABLE message_templates (
  id uuid PRIMARY KEY,
  association_id uuid,
  key text NOT NULL,
  channel template_channel NOT NULL,
  locale text NOT NULL DEFAULT 'fr-CI',
  subject text NOT NULL,
  body text NOT NULL,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE message_templates IS 'Modèles de messages versionnés.';
COMMENT ON COLUMN message_templates.association_id IS 'NULL = modèle plateforme';
COMMENT ON COLUMN message_templates.channel IS 'in_app · push · email · sms · manual';
COMMENT ON COLUMN message_templates.subject IS 'variables Handlebars';
COMMENT ON COLUMN message_templates.body IS 'variables Handlebars';

-- deliveries · module notifications · V1 · lot 2.5
-- Chaque envoi réel sur un canal externe.
CREATE TABLE deliveries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  association_id uuid,
  notification_id uuid,
  channel delivery_channel NOT NULL,
  provider text NOT NULL,
  provider_message_id text,
  recipient_masked text NOT NULL,
  status deliveries_status NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  cost_units int,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz
);
COMMENT ON TABLE deliveries IS 'Chaque envoi réel sur un canal externe.';
COMMENT ON COLUMN deliveries.channel IS 'push · email · sms';
COMMENT ON COLUMN deliveries.provider IS 'webpush pour le push standard ; nom de l''adaptateur pour le groupe 6';
COMMENT ON COLUMN deliveries.provider_message_id IS 'webpush pour le push standard ; nom de l''adaptateur pour le groupe 6';
COMMENT ON COLUMN deliveries.recipient_masked IS '+225 07 •• •• •• 11';
COMMENT ON COLUMN deliveries.status IS 'queued · sent · delivered · failed · bounced';
COMMENT ON COLUMN deliveries.cost_units IS 'coût éventuel (SMS du groupe 6)';

-- files · module storage · V1 · lot 0.5
-- Référentiel de tous les fichiers stockés dans MinIO.
CREATE TABLE files (
  id uuid PRIMARY KEY,
  association_id uuid,
  owner_user_id uuid NOT NULL,
  purpose files_purpose NOT NULL,
  bucket text NOT NULL,
  object_key text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text,
  scan_status files_scan_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT files_sha256_when_scanned CHECK (scan_status = 'pending' OR sha256 IS NOT NULL)
);
COMMENT ON TABLE files IS 'Référentiel de tous les fichiers stockés dans MinIO.';
COMMENT ON COLUMN files.association_id IS 'RLS';
COMMENT ON COLUMN files.purpose IS 'payment_proof · contract_pdf · invoice_pdf · export · logo · cover · import_source · bank_statement';
COMMENT ON COLUMN files.bucket IS '{association_id}/{purpose}/{uuid}.{ext}';
COMMENT ON COLUMN files.object_key IS '{association_id}/{purpose}/{uuid}.{ext}';
COMMENT ON COLUMN files.original_name IS 'nom du fichier déposé (affichage seulement, jamais utilisé comme clé)';
COMMENT ON COLUMN files.mime_type IS 'vérifiés sur le contenu réel';
COMMENT ON COLUMN files.size_bytes IS 'vérifiés sur le contenu réel';
COMMENT ON COLUMN files.sha256 IS 'intégrité et preuve ; calculé par le worker, NULL tant que scan_status = pending';
COMMENT ON COLUMN files.scan_status IS 'pending · clean · infected';

-- outbox_events · module outbox · V1 · lot 0.5
-- Événements de domaine en attente de publication.
CREATE TABLE outbox_events (
  id bigserial PRIMARY KEY,
  association_id uuid,
  actor_user_id uuid,
  event_type text NOT NULL,
  event_version int NOT NULL DEFAULT 1,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE outbox_events IS 'Événements de domaine en attente de publication.';
COMMENT ON COLUMN outbox_events.actor_user_id IS 'auteur de l''action (actorUserId de l''enveloppe) ; NULL pour une tâche système';
COMMENT ON COLUMN outbox_events.event_type IS 'payment.validated';

-- audit_logs · module audit · V1 · lot 0.5
-- Journal d'audit, en ajout seul.
CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_role text NOT NULL,
  association_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  request_id text,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE audit_logs IS 'Journal d''audit, en ajout seul.';
COMMENT ON COLUMN audit_logs.action IS 'payment.validate, association.suspend…';
COMMENT ON COLUMN audit_logs.before IS 'champs modifiés uniquement';
COMMENT ON COLUMN audit_logs.after IS 'champs modifiés uniquement';

-- export_jobs · module reporting · V2 · lot 4.6
-- Exports CSV et PDF asynchrones.
CREATE TABLE export_jobs (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  kind export_jobs_kind NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status export_jobs_status NOT NULL DEFAULT 'queued',
  file_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE export_jobs IS 'Exports CSV et PDF asynchrones.';
COMMENT ON COLUMN export_jobs.association_id IS 'RLS';
COMMENT ON COLUMN export_jobs.kind IS 'project_report_csv · project_report_pdf · members_csv';
COMMENT ON COLUMN export_jobs.status IS 'queued · running · done · failed';

-- usage_daily · module reporting · V2 · lot 4.6
-- Statistiques d'usage par association et par jour (écran super-admin).
CREATE TABLE usage_daily (
  association_id uuid NOT NULL,
  day date NOT NULL,
  logins int NOT NULL,
  active_users int NOT NULL,
  payments_declared int NOT NULL,
  payments_validated int NOT NULL,
  avg_validation_hours numeric NOT NULL,
  PRIMARY KEY (association_id, day)
);
COMMENT ON TABLE usage_daily IS 'Statistiques d''usage par association et par jour (écran super-admin).';

-- password_reset_requests · module identity · V1 · lot 1.1
-- Demandes « mot de passe oublié ». Sans fournisseur, elles sont traitées par le rôle supérieur qui émet un code.
CREATE TABLE password_reset_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  association_id uuid,
  space password_reset_requests_space NOT NULL,
  status password_reset_requests_status NOT NULL DEFAULT 'pending',
  code_id uuid,
  handled_by uuid,
  handled_at timestamptz,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE password_reset_requests IS 'Demandes « mot de passe oublié ». Sans fournisseur, elles sont traitées par le rôle supérieur qui émet un code.';
COMMENT ON COLUMN password_reset_requests.association_id IS 'RLS : association du souscripteur qui traite la demande ; NULL = traité par la plateforme (gestionnaires)';
COMMENT ON COLUMN password_reset_requests.space IS 'association · subscriber · platform';
COMMENT ON COLUMN password_reset_requests.status IS 'pending · code_issued · completed · expired · dismissed';

-- push_subscriptions · module notifications · V2 · lot 4.2
-- Abonnements Web Push (protocole standard, clés VAPID propres, aucun compte chez un tiers).
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  last_success_at timestamptz,
  failed_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
COMMENT ON TABLE push_subscriptions IS 'Abonnements Web Push (protocole standard, clés VAPID propres, aucun compte chez un tiers).';
COMMENT ON COLUMN push_subscriptions.failed_count IS 'désactivé après 5 échecs ou réponse 404/410';

-- bank_statements · module reconciliation · V3 · lot 5.1
-- Relevés bancaires ou mobile money importés par le gestionnaire.
CREATE TABLE bank_statements (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  file_id uuid NOT NULL,
  format_key text NOT NULL,
  column_mapping jsonb NOT NULL,
  period_start date,
  period_end date,
  status bank_statements_status NOT NULL DEFAULT 'uploaded',
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE bank_statements IS 'Relevés bancaires ou mobile money importés par le gestionnaire.';
COMMENT ON COLUMN bank_statements.association_id IS 'RLS';
COMMENT ON COLUMN bank_statements.format_key IS 'format reconnu (banque ou opérateur)';
COMMENT ON COLUMN bank_statements.column_mapping IS 'mémorisé par format pour les imports suivants';
COMMENT ON COLUMN bank_statements.status IS 'uploaded · parsed · matched · closed · failed';
COMMENT ON COLUMN bank_statements.counts IS 'lines · proposed · confirmed · unmatched';

-- statement_lines · module reconciliation · V3 · lot 5.1
-- Lignes d'un relevé et leur rapprochement.
CREATE TABLE statement_lines (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  statement_id uuid NOT NULL,
  line_no int NOT NULL,
  booked_on date NOT NULL,
  amount bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'XOF',
  reference text,
  counterparty text,
  raw jsonb NOT NULL,
  match_payment_id uuid,
  match_score numeric,
  match_status statement_lines_match_status NOT NULL DEFAULT 'unmatched',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (statement_id, line_no)
);
COMMENT ON TABLE statement_lines IS 'Lignes d''un relevé et leur rapprochement.';
COMMENT ON COLUMN statement_lines.association_id IS 'RLS';
COMMENT ON COLUMN statement_lines.amount IS 'crédit en unité entière';
COMMENT ON COLUMN statement_lines.match_score IS '0 à 1';
COMMENT ON COLUMN statement_lines.match_status IS 'unmatched · proposed · confirmed · ignored';

-- api_keys · module developer · V3 · lot 5.2
-- Clés d'API publique par association.
CREATE TABLE api_keys (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  name text NOT NULL,
  prefix text NOT NULL UNIQUE,
  key_hash text NOT NULL,
  scopes text[] NOT NULL,
  last_used_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
COMMENT ON TABLE api_keys IS 'Clés d''API publique par association.';
COMMENT ON COLUMN api_keys.association_id IS 'RLS';
COMMENT ON COLUMN api_keys.prefix IS '8 premiers caractères, affichés';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 de la clé, jamais la clé';

-- webhook_endpoints · module developer · V3 · lot 5.2
-- Webhooks sortants configurés par une association.
CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  url text NOT NULL,
  secret_encrypted bytea NOT NULL,
  events text[] NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE webhook_endpoints IS 'Webhooks sortants configurés par une association.';
COMMENT ON COLUMN webhook_endpoints.association_id IS 'RLS';
COMMENT ON COLUMN webhook_endpoints.url IS 'HTTPS uniquement';
COMMENT ON COLUMN webhook_endpoints.secret_encrypted IS 'signature HMAC-SHA256';

-- webhook_deliveries · module developer · V3 · lot 5.2
-- Tentatives d'envoi des webhooks sortants.
CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  endpoint_id uuid NOT NULL,
  event_id bigint NOT NULL,
  status webhook_deliveries_status NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_status_code int,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE webhook_deliveries IS 'Tentatives d''envoi des webhooks sortants.';
COMMENT ON COLUMN webhook_deliveries.association_id IS 'RLS';
COMMENT ON COLUMN webhook_deliveries.event_id IS 'outbox_events.id';
COMMENT ON COLUMN webhook_deliveries.status IS 'pending · succeeded · failed · abandoned';

-- payment_intents · module payments_online · OPT · lot 6.3
-- Groupe 6.3 (option) : intentions de paiement chez un prestataire agréé. Cotiz ne détient jamais les fonds.
CREATE TABLE payment_intents (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  provider_ref text,
  amount bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'XOF',
  allocations jsonb NOT NULL,
  status payment_intents_status NOT NULL DEFAULT 'created',
  payment_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payment_intents IS 'Groupe 6.3 (option) : intentions de paiement chez un prestataire agréé. Cotiz ne détient jamais les fonds.';
COMMENT ON COLUMN payment_intents.association_id IS 'RLS';
COMMENT ON COLUMN payment_intents.allocations IS 'répartition demandée';
COMMENT ON COLUMN payment_intents.status IS 'created · pending · succeeded · failed · expired';
COMMENT ON COLUMN payment_intents.payment_id IS 'paiement créé à la confirmation';


-- Clés étrangères
ALTER TABLE credentials ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE subscriber_profiles ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE sessions ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE one_time_codes ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE one_time_codes ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE one_time_codes ADD FOREIGN KEY (issued_by) REFERENCES users(id);
ALTER TABLE mfa_factors ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE platform_staff ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE memberships ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE memberships ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE memberships ADD FOREIGN KEY (invited_by) REFERENCES users(id);
ALTER TABLE association_requests ADD FOREIGN KEY (desired_plan_id) REFERENCES plans(id);
ALTER TABLE association_requests ADD FOREIGN KEY (decided_by) REFERENCES users(id);
ALTER TABLE association_requests ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE associations ADD FOREIGN KEY (logo_file_id) REFERENCES files(id);
ALTER TABLE association_payment_methods ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE subscriptions ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE subscriptions ADD FOREIGN KEY (plan_id) REFERENCES plans(id);
ALTER TABLE invoices ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE invoices ADD FOREIGN KEY (subscription_id) REFERENCES subscriptions(id);
ALTER TABLE invoices ADD FOREIGN KEY (pdf_file_id) REFERENCES files(id);
ALTER TABLE projects ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE projects ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE project_payment_methods ADD FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE project_payment_methods ADD FOREIGN KEY (payment_method_id) REFERENCES association_payment_methods(id);
ALTER TABLE project_payment_methods ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE enrollments ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE enrollments ADD FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE enrollments ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE enrollments ADD FOREIGN KEY (withdrawn_by) REFERENCES users(id);
ALTER TABLE installments ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE installments ADD FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE installments ADD FOREIGN KEY (enrollment_id) REFERENCES enrollments(id);
ALTER TABLE installments ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE payments ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE payments ADD FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE payments ADD FOREIGN KEY (enrollment_id) REFERENCES enrollments(id);
ALTER TABLE payments ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE payments ADD FOREIGN KEY (payment_method_id) REFERENCES association_payment_methods(id);
ALTER TABLE payments ADD FOREIGN KEY (proof_file_id) REFERENCES files(id);
ALTER TABLE payments ADD FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE allocations ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE allocations ADD FOREIGN KEY (payment_id) REFERENCES payments(id);
ALTER TABLE allocations ADD FOREIGN KEY (installment_id) REFERENCES installments(id);
ALTER TABLE contracts ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE contracts ADD FOREIGN KEY (association_signed_by) REFERENCES users(id);
ALTER TABLE contract_signatures ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE contract_signatures ADD FOREIGN KEY (contract_id) REFERENCES contracts(id);
ALTER TABLE contract_signatures ADD FOREIGN KEY (enrollment_id) REFERENCES enrollments(id);
ALTER TABLE contract_signatures ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE contract_signatures ADD FOREIGN KEY (pdf_file_id) REFERENCES files(id);
ALTER TABLE import_jobs ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE import_jobs ADD FOREIGN KEY (source_file_id) REFERENCES files(id);
ALTER TABLE import_jobs ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE import_rows ADD FOREIGN KEY (import_job_id) REFERENCES import_jobs(id);
ALTER TABLE import_rows ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE reminder_rules ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE reminder_rules ADD FOREIGN KEY (template_id) REFERENCES message_templates(id);
ALTER TABLE reminder_runs ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE reminder_runs ADD FOREIGN KEY (triggered_by) REFERENCES users(id);
ALTER TABLE reminder_runs ADD FOREIGN KEY (handled_by) REFERENCES users(id);
ALTER TABLE notifications ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE notifications ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE message_templates ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE deliveries ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE files ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE files ADD FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE export_jobs ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE export_jobs ADD FOREIGN KEY (requested_by) REFERENCES users(id);
ALTER TABLE password_reset_requests ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE password_reset_requests ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE password_reset_requests ADD FOREIGN KEY (code_id) REFERENCES one_time_codes(id);
ALTER TABLE password_reset_requests ADD FOREIGN KEY (handled_by) REFERENCES users(id);
ALTER TABLE push_subscriptions ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE bank_statements ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE bank_statements ADD FOREIGN KEY (file_id) REFERENCES files(id);
ALTER TABLE bank_statements ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE statement_lines ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE statement_lines ADD FOREIGN KEY (statement_id) REFERENCES bank_statements(id);
ALTER TABLE statement_lines ADD FOREIGN KEY (match_payment_id) REFERENCES payments(id);
ALTER TABLE api_keys ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE api_keys ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE webhook_endpoints ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE webhook_deliveries ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE webhook_deliveries ADD FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id);
ALTER TABLE payment_intents ADD FOREIGN KEY (association_id) REFERENCES associations(id);
ALTER TABLE payment_intents ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE payment_intents ADD FOREIGN KEY (payment_id) REFERENCES payments(id);

-- ---------------------------------------------------------------------
-- Invariants garantis par la base
-- ---------------------------------------------------------------------
-- 1. updated_at automatique
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER associations_touch BEFORE UPDATE ON associations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER payments_touch BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 2. Un contrat verrouillé ne se modifie plus
CREATE FUNCTION forbid_locked_contract_update() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF OLD.locked_at IS NOT NULL THEN RAISE EXCEPTION 'contract_locked' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contracts_locked BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION forbid_locked_contract_update();

-- 3. Paiement validé : somme des allocations confirmées = montant reçu (sinon montant déclaré)
CREATE FUNCTION check_validated_payment() RETURNS trigger LANGUAGE plpgsql AS
$$ DECLARE s bigint; BEGIN
  IF NEW.status = 'validated' THEN
    SELECT coalesce(sum(amount), 0) INTO s FROM allocations WHERE payment_id = NEW.id AND state = 'confirmed';
    IF s <> coalesce(NEW.amount_received, NEW.amount_declared) THEN
      RAISE EXCEPTION 'allocation_mismatch' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payments_allocations_sum AFTER INSERT OR UPDATE ON payments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_validated_payment();

-- 4. Échéance : amount_paid + amount_pending ne dépasse jamais amount_due
ALTER TABLE installments ADD CONSTRAINT installments_no_overcommit CHECK (amount_paid + amount_pending <= amount_due);
ALTER TABLE installments ADD CONSTRAINT installments_non_negative CHECK (amount_paid >= 0 AND amount_pending >= 0 AND amount_due > 0);
ALTER TABLE payments ADD CONSTRAINT payments_positive CHECK (amount_declared > 0 AND (amount_received IS NULL OR amount_received > 0));
ALTER TABLE payments ADD CONSTRAINT payments_proof_or_reference CHECK (proof_file_id IS NOT NULL OR transaction_reference IS NOT NULL);

-- 5. Journal d'audit et signatures en ajout seul (voir aussi les droits plus bas)
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'append_only' USING ERRCODE = 'P0001'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER signatures_append_only BEFORE UPDATE OR DELETE ON contract_signatures FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
-- TRUNCATE ignore la RLS et les déclencheurs de ligne : refusé aussi au propriétaire et au superutilisateur.
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER signatures_no_truncate BEFORE TRUNCATE ON contract_signatures FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();


-- ---------------------------------------------------------------------
-- Index des requêtes chaudes (architecture/09-cache-performance.md)
-- ---------------------------------------------------------------------
CREATE INDEX installments_grid ON installments (association_id, project_id, due_date) INCLUDE (status, amount_due, amount_paid, amount_pending, user_id);
CREATE INDEX installments_self ON installments (user_id, due_date);
CREATE INDEX installments_open_due ON installments (due_date) WHERE status IN ('upcoming', 'due', 'partial');
CREATE INDEX payments_queue ON payments (association_id, declared_at) WHERE status = 'pending';
CREATE INDEX payments_self ON payments (user_id, declared_at DESC);
CREATE INDEX allocations_installment ON allocations (installment_id);
CREATE INDEX enrollments_project ON enrollments (association_id, project_id, status);
CREATE INDEX enrollments_user ON enrollments (user_id);
CREATE INDEX memberships_user ON memberships (user_id) WHERE status = 'active';
CREATE INDEX notifications_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX outbox_unpublished ON outbox_events (id) WHERE published_at IS NULL;
CREATE INDEX users_name_trgm ON users USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX audit_entity ON audit_logs (association_id, entity_type, entity_id, occurred_at DESC);
CREATE UNIQUE INDEX sessions_refresh_token ON sessions (refresh_token_hash);
CREATE INDEX sessions_family ON sessions (family_id);
CREATE INDEX sessions_user_active ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX codes_pending ON one_time_codes (association_id, purpose) WHERE consumed_at IS NULL;
CREATE INDEX resets_pending ON password_reset_requests (association_id, created_at) WHERE status = 'pending';
CREATE INDEX reminder_queue ON reminder_runs (association_id, run_date) WHERE status = 'to_handle';
CREATE UNIQUE INDEX subscriptions_one_active ON subscriptions (association_id) WHERE status IN ('trialing', 'active', 'past_due');

-- ---------------------------------------------------------------------
-- Row Level Security
-- Tables sans RLS (globales, accès limité au module identity/access/billing et testé) :
--   credentials, mfa_factors, plans, platform_staff, sessions, subscriber_profiles, users
-- Le super-admin passe par le rôle cotiz_platform (BYPASSRLS), uniquement sous /platform, audité.
-- ---------------------------------------------------------------------

-- one_time_codes
ALTER TABLE one_time_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_time_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_manage ON one_time_codes
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY auth_access ON one_time_codes
  USING (app_space() IN ('auth', 'system'))
  WITH CHECK (app_space() IN ('auth', 'system'));

-- memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY self_read ON memberships FOR SELECT
  USING (user_id = app_user_id() AND app_space() IN ('subscriber', 'auth'));

-- association_requests
ALTER TABLE association_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE association_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY public_submit ON association_requests FOR INSERT
  WITH CHECK (app_space() = 'public');

-- associations
ALTER TABLE associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE associations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON associations
  USING (id = app_association_id())
  WITH CHECK (id = app_association_id());
CREATE POLICY member_read ON associations FOR SELECT
  USING (app_space() IN ('subscriber', 'auth') AND EXISTS (SELECT 1 FROM memberships m WHERE m.association_id = associations.id AND m.user_id = app_user_id() AND m.status = 'active'));
CREATE POLICY system_read ON associations FOR SELECT
  USING (app_space() = 'system');

-- association_payment_methods
ALTER TABLE association_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE association_payment_methods FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON association_payment_methods
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY member_read ON association_payment_methods FOR SELECT
  USING (app_space() IN ('subscriber', 'auth') AND EXISTS (SELECT 1 FROM memberships m WHERE m.association_id = association_payment_methods.association_id AND m.user_id = app_user_id() AND m.status = 'active'));

-- subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY system_access ON subscriptions
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());

-- projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY subscriber_enrolled_read ON projects FOR SELECT
  USING (app_space() = 'subscriber' AND EXISTS (SELECT 1 FROM enrollments e WHERE e.project_id = projects.id AND e.user_id = app_user_id()));
CREATE POLICY system_access ON projects
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- project_payment_methods
ALTER TABLE project_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_payment_methods FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_payment_methods
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY subscriber_enrolled_read ON project_payment_methods FOR SELECT
  USING (app_space() = 'subscriber' AND EXISTS (SELECT 1 FROM enrollments e WHERE e.project_id = project_payment_methods.project_id AND e.user_id = app_user_id()));

-- enrollments
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON enrollments
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY subscriber_self_read ON enrollments FOR SELECT
  USING (user_id = app_user_id() AND app_space() = 'subscriber');
CREATE POLICY subscriber_sign_update ON enrollments FOR UPDATE
  USING (user_id = app_user_id() AND app_space() = 'subscriber')
  WITH CHECK (user_id = app_user_id() AND app_space() = 'subscriber');
CREATE POLICY system_access ON enrollments
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- installments
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON installments
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY subscriber_self_read ON installments FOR SELECT
  USING (user_id = app_user_id() AND app_space() = 'subscriber');
CREATE POLICY subscriber_pending_update ON installments FOR UPDATE
  USING (user_id = app_user_id() AND app_space() = 'subscriber')
  WITH CHECK (user_id = app_user_id() AND app_space() = 'subscriber');
CREATE POLICY system_access ON installments
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY subscriber_self_read ON payments FOR SELECT
  USING (user_id = app_user_id() AND app_space() = 'subscriber');
CREATE POLICY subscriber_declare ON payments FOR INSERT
  WITH CHECK (user_id = app_user_id() AND app_space() = 'subscriber');

-- allocations
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON allocations
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY subscriber_self ON allocations
  USING (app_space() = 'subscriber' AND EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id AND p.user_id = app_user_id()))
  WITH CHECK (app_space() = 'subscriber' AND EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id AND p.user_id = app_user_id()));

-- contracts
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contracts
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY subscriber_enrolled_read ON contracts FOR SELECT
  USING (app_space() = 'subscriber' AND EXISTS (SELECT 1 FROM enrollments e WHERE e.project_id = contracts.project_id AND e.user_id = app_user_id()));

-- contract_signatures
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signatures FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contract_signatures
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY subscriber_self_read ON contract_signatures FOR SELECT
  USING (user_id = app_user_id() AND app_space() = 'subscriber');
CREATE POLICY subscriber_sign ON contract_signatures FOR INSERT
  WITH CHECK (user_id = app_user_id() AND app_space() = 'subscriber');

-- import_jobs
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON import_jobs
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());

-- import_rows
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON import_rows
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());

-- reminder_rules
ALTER TABLE reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reminder_rules
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY system_access ON reminder_rules
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- reminder_runs
ALTER TABLE reminder_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reminder_runs
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY system_access ON reminder_runs
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON notifications
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
CREATE POLICY system_access ON notifications
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- notification_preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON notification_preferences
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
CREATE POLICY system_access ON notification_preferences
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- message_templates
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_templates_read ON message_templates FOR SELECT
  USING (association_id IS NULL);
CREATE POLICY tenant_templates ON message_templates
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());

-- deliveries
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON deliveries
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
CREATE POLICY system_access ON deliveries
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- files
-- owner_access : le souscripteur, dans son espace, sur sa preuve de paiement (seul usage qu'il dépose), avant et après
-- son rattachement à l'association ; il ne la rattache jamais lui-même. En espace association, tenant_isolation suffit :
-- un gestionnaire retiré ne garde aucun accès aux fichiers qu'il a déposés pour elle.
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON files
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY owner_access ON files
  USING (app_space() = 'subscriber' AND owner_user_id = app_user_id() AND purpose = 'payment_proof')
  WITH CHECK (app_space() = 'subscriber' AND owner_user_id = app_user_id() AND purpose = 'payment_proof'
              AND association_id IS NULL);
CREATE POLICY system_access ON files
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- outbox_events
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY append ON outbox_events FOR INSERT
  WITH CHECK (true);
CREATE POLICY relay ON outbox_events
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY append ON audit_logs FOR INSERT
  WITH CHECK (true);
CREATE POLICY tenant_read ON audit_logs FOR SELECT
  USING (association_id = app_association_id());
CREATE POLICY system_read ON audit_logs FOR SELECT
  USING (app_space() = 'system');

-- export_jobs
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON export_jobs
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());

-- usage_daily
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_daily FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON usage_daily
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY system_access ON usage_daily
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- password_reset_requests
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_manage ON password_reset_requests
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY auth_access ON password_reset_requests
  USING (app_space() IN ('auth', 'system'))
  WITH CHECK (app_space() IN ('auth', 'system'));

-- push_subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON push_subscriptions
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
CREATE POLICY system_access ON push_subscriptions
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- bank_statements
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bank_statements
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());

-- statement_lines
ALTER TABLE statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON statement_lines
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());

-- api_keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON api_keys
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());

-- webhook_endpoints
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_endpoints
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY system_access ON webhook_endpoints
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- webhook_deliveries
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_deliveries
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY system_access ON webhook_deliveries
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');

-- payment_intents
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_intents
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
CREATE POLICY subscriber_self_read ON payment_intents FOR SELECT
  USING (user_id = app_user_id() AND app_space() = 'subscriber');
CREATE POLICY subscriber_intent ON payment_intents FOR INSERT
  WITH CHECK (user_id = app_user_id() AND app_space() = 'subscriber');

-- ---------------------------------------------------------------------
-- Rôles et droits (exécuté par cotiz_migrator ; les rôles sont créés par l'exploitation)
--   cotiz_migrator  : propriétaire du schéma, migrations uniquement
--   cotiz_app       : api + worker, SANS BYPASSRLS
--   cotiz_platform  : cas d'usage /platform uniquement, BYPASSRLS, chaque requête auditée
--   cotiz_readonly  : rapports, SELECT seulement
-- ---------------------------------------------------------------------
-- CREATE ROLE cotiz_app LOGIN NOBYPASSRLS;  CREATE ROLE cotiz_platform LOGIN BYPASSRLS;  CREATE ROLE cotiz_readonly LOGIN;
GRANT USAGE ON SCHEMA public TO cotiz_app, cotiz_platform, cotiz_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cotiz_app, cotiz_platform;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO cotiz_app, cotiz_platform;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cotiz_readonly;
REVOKE UPDATE, DELETE ON audit_logs, contract_signatures FROM cotiz_app, cotiz_platform;
REVOKE DELETE ON payments, allocations, installments, invoices FROM cotiz_app, cotiz_platform;
-- plans : écrits par la plateforme seulement (cotiz_platform) ; plans et abonnements jamais supprimés (archivage, résiliation).
REVOKE INSERT, UPDATE ON plans FROM cotiz_app;
REVOKE DELETE ON plans, subscriptions FROM cotiz_app, cotiz_platform;
