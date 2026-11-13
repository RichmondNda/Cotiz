-- Lot 4.6 · étape 1 : factures, exports et statistiques d'usage (docs/specs/schema.sql, « lot 4.6 »).
-- invoices : factures de la plateforme aux associations, numéro continu CTZ-<année>-<numéro sur 6 chiffres> tiré d'une
-- séquence globale jamais remise à zéro (une facture annulée garde son numéro) ; pas de suppression physique.
-- export_jobs : exports asynchrones d'une association. usage_daily : agrégats quotidiens par association, écrits par
-- le worker (system_access). RLS forcée sur les trois tables ; droits par défaut du lot 0 (0000_foundations).

CREATE TYPE invoices_status AS ENUM ('draft', 'open', 'paid', 'overdue', 'void');
--> statement-breakpoint
CREATE TYPE export_jobs_kind AS ENUM ('project_report_csv', 'project_report_pdf', 'members_csv');
--> statement-breakpoint
CREATE TYPE export_jobs_status AS ENUM ('queued', 'running', 'done', 'failed');
--> statement-breakpoint
CREATE SEQUENCE invoice_number_seq;
--> statement-breakpoint
CREATE TABLE invoices (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  number text NOT NULL UNIQUE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'XOF' CONSTRAINT invoices_currency_xof CHECK (currency = 'XOF'),
  status invoices_status NOT NULL DEFAULT 'draft',
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  pdf_file_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
COMMENT ON TABLE invoices IS 'Factures de la plateforme aux associations.';
--> statement-breakpoint
COMMENT ON COLUMN invoices.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN invoices.number IS 'numérotation continue, jamais réutilisée';
--> statement-breakpoint
COMMENT ON COLUMN invoices.status IS 'draft · open · paid · overdue · void';
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE export_jobs IS 'Exports CSV et PDF asynchrones.';
--> statement-breakpoint
COMMENT ON COLUMN export_jobs.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN export_jobs.kind IS 'project_report_csv · project_report_pdf · members_csv';
--> statement-breakpoint
COMMENT ON COLUMN export_jobs.status IS 'queued · running · done · failed';
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE usage_daily IS 'Statistiques d''usage par association et par jour (écran super-admin).';
--> statement-breakpoint
ALTER TABLE invoices ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE invoices ADD FOREIGN KEY (subscription_id) REFERENCES subscriptions(id);
--> statement-breakpoint
ALTER TABLE invoices ADD FOREIGN KEY (pdf_file_id) REFERENCES files(id);
--> statement-breakpoint
ALTER TABLE export_jobs ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE export_jobs ADD FOREIGN KEY (requested_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invoices
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE export_jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON export_jobs
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE usage_daily FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON usage_daily
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY system_access ON usage_daily
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
--> statement-breakpoint
REVOKE DELETE ON invoices FROM cotiz_app, cotiz_platform;
