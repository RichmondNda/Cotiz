-- Lot 1.2 · étape 2 : tables billing (plans, subscriptions ; docs/specs/schema.sql, « lot 1.2 »).
-- plans : table globale sans RLS, écrite par la plateforme seulement (cotiz_platform) ; version pour If-Match
-- (pf.plan.write), features = clés planGated de features.yaml. subscriptions : l'association et le worker ; une seule
-- souscription en cours. Ni plan ni abonnement ne se supprime.

CREATE TYPE subscriptions_billing_period AS ENUM ('monthly', 'yearly');
--> statement-breakpoint
CREATE TYPE subscriptions_status AS ENUM ('trialing', 'active', 'past_due', 'suspended', 'canceled');
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE plans IS 'Formules d''abonnement gérées par le super-admin.';
--> statement-breakpoint
COMMENT ON COLUMN plans.price_monthly IS 'en XOF';
--> statement-breakpoint
COMMENT ON COLUMN plans.price_yearly IS 'en XOF';
--> statement-breakpoint
COMMENT ON COLUMN plans.max_projects IS 'NULL = illimité';
--> statement-breakpoint
COMMENT ON COLUMN plans.max_subscribers IS 'NULL = illimité';
--> statement-breakpoint
COMMENT ON COLUMN plans.max_managers IS 'NULL = illimité';
--> statement-breakpoint
COMMENT ON COLUMN plans.features IS 'clés planGated de features.yaml : contracts · imports · auto_reminders · team · exports · reconciliation · public_api · analytics';
--> statement-breakpoint
COMMENT ON COLUMN plans.version IS 'verrouillage optimiste';
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE subscriptions IS 'Abonnement en cours d''une association.';
--> statement-breakpoint
COMMENT ON COLUMN subscriptions.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN subscriptions.billing_period IS 'monthly · yearly';
--> statement-breakpoint
COMMENT ON COLUMN subscriptions.status IS 'trialing · active · past_due · suspended · canceled';
--> statement-breakpoint
COMMENT ON COLUMN subscriptions.manager_seats_override IS 'surcharge décidée par le super-admin';
--> statement-breakpoint
-- association_requests.desired_plan_id → plans : posée au lot 1.3, avec la table.
ALTER TABLE subscriptions ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE subscriptions ADD FOREIGN KEY (plan_id) REFERENCES plans(id);
--> statement-breakpoint
CREATE UNIQUE INDEX subscriptions_one_active ON subscriptions (association_id) WHERE status IN ('trialing', 'active', 'past_due');
--> statement-breakpoint
-- RLS (architecture/02).
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON subscriptions
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY system_access ON subscriptions
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
--> statement-breakpoint

-- Droits : plans écrits par la plateforme seulement (cotiz_platform) ; plans et abonnements jamais supprimés
-- (archivage, résiliation : règle des données financières).
REVOKE INSERT, UPDATE ON plans FROM cotiz_app;
--> statement-breakpoint
REVOKE DELETE ON plans, subscriptions FROM cotiz_app, cotiz_platform;
