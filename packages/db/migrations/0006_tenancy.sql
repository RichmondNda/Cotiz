-- Lot 1.2 · étape 1 : tables tenancy (associations, association_payment_methods, memberships ; docs/specs/schema.sql,
-- « lot 1.2 »), et clés étrangères vers associations laissées en attente par les lots 0.5 (files) et 1.1
-- (one_time_codes, password_reset_requests).
-- member_read et self_read (lecture par la personne elle-même) sont limitées aux espaces subscriber et auth : un
-- contexte d'association ou de plateforme ne voit jamais les appartenances d'une personne ailleurs.

CREATE TYPE memberships_role AS ENUM ('owner', 'manager', 'viewer', 'subscriber');
--> statement-breakpoint
CREATE TYPE memberships_status AS ENUM ('invited', 'active', 'removed');
--> statement-breakpoint
CREATE TYPE associations_status AS ENUM ('onboarding', 'active', 'past_due', 'suspended', 'closed');
--> statement-breakpoint
CREATE TYPE association_payment_methods_kind AS ENUM ('bank_transfer', 'mobile_money', 'cash', 'other');
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE associations IS 'Le client de Cotiz. Racine de l''isolation multi-tenant.';
--> statement-breakpoint
COMMENT ON COLUMN associations.status IS 'onboarding · active · past_due · suspended · closed';
--> statement-breakpoint
COMMENT ON COLUMN associations.currency IS 'XOF';
--> statement-breakpoint
COMMENT ON COLUMN associations.timezone IS 'Africa/Abidjan';
--> statement-breakpoint
COMMENT ON COLUMN associations.default_grace_days IS 'délai avant « en retard »';
--> statement-breakpoint
COMMENT ON COLUMN associations.version IS 'verrouillage optimiste';
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE association_payment_methods IS 'Comment les souscripteurs paient l''association (écran onboarding étape 3).';
--> statement-breakpoint
COMMENT ON COLUMN association_payment_methods.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN association_payment_methods.kind IS 'bank_transfer · mobile_money · cash · other';
--> statement-breakpoint
COMMENT ON COLUMN association_payment_methods.label IS '« Orange Money », « SGBCI »…';
--> statement-breakpoint
COMMENT ON COLUMN association_payment_methods.details IS 'IBAN, banque, opérateur, numéro — schéma validé par type';
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE memberships IS 'Lien entre une personne et une association, avec son rôle. Un souscripteur dans deux associations = deux lignes.';
--> statement-breakpoint
COMMENT ON COLUMN memberships.association_id IS 'colonne RLS';
--> statement-breakpoint
COMMENT ON COLUMN memberships.role IS 'owner · manager · viewer · subscriber';
--> statement-breakpoint
COMMENT ON COLUMN memberships.status IS 'invited · active · removed';
--> statement-breakpoint
COMMENT ON COLUMN memberships.title IS 'fonction affichée (« Trésorière »), facultative';
--> statement-breakpoint
-- Clés étrangères, dont celles laissées en attente par les lots 0.5 et 1.1.
ALTER TABLE one_time_codes ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE memberships ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE memberships ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE memberships ADD FOREIGN KEY (invited_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE associations ADD FOREIGN KEY (logo_file_id) REFERENCES files(id);
--> statement-breakpoint
ALTER TABLE association_payment_methods ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE files ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE password_reset_requests ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
CREATE TRIGGER associations_touch BEFORE UPDATE ON associations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE INDEX memberships_user ON memberships (user_id) WHERE status = 'active';
--> statement-breakpoint
-- RLS (architecture/02).
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY self_read ON memberships FOR SELECT
  USING (user_id = app_user_id() AND app_space() IN ('subscriber', 'auth'));
--> statement-breakpoint
ALTER TABLE associations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE associations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_self ON associations
  USING (id = app_association_id())
  WITH CHECK (id = app_association_id());
--> statement-breakpoint
CREATE POLICY member_read ON associations FOR SELECT
  USING (app_space() IN ('subscriber', 'auth') AND EXISTS (SELECT 1 FROM memberships m WHERE m.association_id = associations.id AND m.user_id = app_user_id() AND m.status = 'active'));
--> statement-breakpoint
CREATE POLICY system_read ON associations FOR SELECT
  USING (app_space() = 'system');
--> statement-breakpoint
ALTER TABLE association_payment_methods ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE association_payment_methods FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON association_payment_methods
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY member_read ON association_payment_methods FOR SELECT
  USING (app_space() IN ('subscriber', 'auth') AND EXISTS (SELECT 1 FROM memberships m WHERE m.association_id = association_payment_methods.association_id AND m.user_id = app_user_id() AND m.status = 'active'));
