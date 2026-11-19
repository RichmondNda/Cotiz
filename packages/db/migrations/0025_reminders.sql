-- Lot 4.3 · étape 1 : relances automatiques et file « À relancer » (docs/specs/schema.sql, « lot 4.3 »).
-- reminder_rules : règles de relance d'une association ; reminder_runs : chaque relance (automatique ou manuelle),
-- unique par règle, échéance et jour local. RLS forcée : l'association (tenant_isolation) et le worker en espace
-- system (system_access) pour la tâche quotidienne reminders.evaluate, qui parcourt toutes les associations.

CREATE TYPE reminder_rules_trigger AS ENUM ('before_due', 'on_due', 'after_due');
--> statement-breakpoint
CREATE TYPE reminder_runs_kind AS ENUM ('automatic', 'manual');
--> statement-breakpoint
CREATE TYPE reminder_runs_status AS ENUM ('auto_sent', 'to_handle', 'handled', 'dismissed');
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE reminder_rules IS 'Règles de relance automatique.';
--> statement-breakpoint
COMMENT ON COLUMN reminder_rules.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN reminder_rules.project_id IS 'NULL = tous les projets';
--> statement-breakpoint
COMMENT ON COLUMN reminder_rules.trigger IS 'before_due · on_due · after_due';
--> statement-breakpoint
COMMENT ON COLUMN reminder_rules.channels IS 'in_app · push (sms · email seulement si le groupe 6 est activé)';
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE reminder_runs IS 'Chaque relance envoyée (auto ou manuelle).';
--> statement-breakpoint
COMMENT ON COLUMN reminder_runs.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN reminder_runs.kind IS 'automatic · manual';
--> statement-breakpoint
COMMENT ON COLUMN reminder_runs.status IS 'auto_sent · to_handle · handled · dismissed';
--> statement-breakpoint
COMMENT ON COLUMN reminder_runs.channels IS 'canaux automatiques utilisés (in_app, push)';
--> statement-breakpoint
COMMENT ON COLUMN reminder_runs.message IS 'message prêt à copier (rendu du modèle)';
--> statement-breakpoint
COMMENT ON COLUMN reminder_runs.handled_by IS 'marquage dans la file « À relancer »';
--> statement-breakpoint
COMMENT ON COLUMN reminder_runs.handled_at IS 'marquage dans la file « À relancer »';
--> statement-breakpoint
COMMENT ON COLUMN reminder_runs.run_date IS 'jour de la relance, fuseau de l''association';
--> statement-breakpoint
ALTER TABLE reminder_rules ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE reminder_rules ADD FOREIGN KEY (template_id) REFERENCES message_templates(id);
--> statement-breakpoint
ALTER TABLE reminder_runs ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE reminder_runs ADD FOREIGN KEY (triggered_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE reminder_runs ADD FOREIGN KEY (handled_by) REFERENCES users(id);
--> statement-breakpoint
CREATE INDEX reminder_queue ON reminder_runs (association_id, run_date) WHERE status = 'to_handle';
--> statement-breakpoint
-- RLS (architecture/02).
ALTER TABLE reminder_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reminder_rules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON reminder_rules
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY system_access ON reminder_rules
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
--> statement-breakpoint
ALTER TABLE reminder_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reminder_runs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON reminder_runs
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY system_access ON reminder_runs
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
