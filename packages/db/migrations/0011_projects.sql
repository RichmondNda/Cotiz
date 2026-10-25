-- Lot 2.2 · étape 1 : tables projects et project_payment_methods (docs/specs/schema.sql, « lot 2.2 »).
-- RLS : l'association (tenant_isolation) et, pour projects, le worker (system_access : tâche projects.activate).
-- Les lectures souscripteur (subscriber_enrolled_read) lisent enrollments : posées par la migration du lot 2.3 qui crée
-- cette table (choix Q5). La clé étrangère vers association_payment_methods empêche de supprimer un moyen retenu par
-- un projet : as.pm le désactive (report du lot 2.1). Clés composites (projet, moyen) + association : la RLS ne
-- contrôle que association_id, une clé simple accepterait le lien d'un projet vers le moyen d'une autre association
-- (schema.sql modifié avec accord).

CREATE TYPE projects_status AS ENUM ('draft', 'enrolling', 'active', 'completed', 'archived');
--> statement-breakpoint
CREATE TYPE projects_frequency AS ENUM ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual');
--> statement-breakpoint
CREATE TYPE projects_schedule_type AS ENUM ('fixed', 'rolling');
--> statement-breakpoint
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
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, association_id)
);
--> statement-breakpoint
COMMENT ON TABLE projects IS 'Un projet de cotisation.';
--> statement-breakpoint
COMMENT ON COLUMN projects.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN projects.description IS 'Markdown restreint';
--> statement-breakpoint
COMMENT ON COLUMN projects.status IS 'draft · enrolling · active · completed · archived';
--> statement-breakpoint
COMMENT ON COLUMN projects.required_subscribers IS 'NULL = sans limite';
--> statement-breakpoint
COMMENT ON COLUMN projects.entry_fee_amount IS 'fonds d''entrée';
--> statement-breakpoint
COMMENT ON COLUMN projects.installment_amount IS 'montant par échéance';
--> statement-breakpoint
COMMENT ON COLUMN projects.frequency IS 'weekly · monthly · quarterly · semiannual · annual';
--> statement-breakpoint
COMMENT ON COLUMN projects.due_day IS 'jour d''échéance (ex. 5)';
--> statement-breakpoint
COMMENT ON COLUMN projects.schedule_type IS 'fixed · rolling';
--> statement-breakpoint
COMMENT ON COLUMN projects.end_date IS 'end_date NULL si cycle roulant';
--> statement-breakpoint
COMMENT ON COLUMN projects.financial_terms_locked_at IS 'posé au 1er paiement : montants et fréquence deviennent non modifiables';
--> statement-breakpoint
COMMENT ON COLUMN projects.version IS 'verrouillage optimiste';
--> statement-breakpoint
CREATE TABLE project_payment_methods (
  project_id uuid NOT NULL,
  payment_method_id uuid NOT NULL,
  association_id uuid NOT NULL,
  instructions_override text,
  PRIMARY KEY (project_id, payment_method_id)
);
--> statement-breakpoint
COMMENT ON TABLE project_payment_methods IS 'Moyens de paiement retenus pour un projet (surcharge des moyens par défaut).';
--> statement-breakpoint
COMMENT ON COLUMN project_payment_methods.association_id IS 'RLS';
--> statement-breakpoint
ALTER TABLE projects ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE projects ADD FOREIGN KEY (created_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE association_payment_methods ADD UNIQUE (id, association_id);
--> statement-breakpoint
ALTER TABLE project_payment_methods ADD FOREIGN KEY (project_id, association_id) REFERENCES projects(id, association_id);
--> statement-breakpoint
ALTER TABLE project_payment_methods ADD FOREIGN KEY (payment_method_id, association_id)
  REFERENCES association_payment_methods(id, association_id);
--> statement-breakpoint
ALTER TABLE project_payment_methods ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
-- RLS (architecture/02).
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON projects
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY system_access ON projects
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
--> statement-breakpoint
ALTER TABLE project_payment_methods ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE project_payment_methods FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON project_payment_methods
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
