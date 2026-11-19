-- Lot 4.4 · étape 1 : imports en masse de souscripteurs (docs/specs/schema.sql, « lot 4.4 »).
-- import_jobs : un import (fichier déposé, correspondance des colonnes, statut, compteurs) ;
-- import_rows : ses lignes, éditables avant l'exécution. RLS de l'association seule (tenant_isolation, forcée) :
-- le worker les lit et les écrit dans le contexte de l'association de l'import.

CREATE TYPE import_jobs_status AS ENUM ('uploaded', 'mapped', 'validated', 'importing', 'completed', 'failed');
--> statement-breakpoint
CREATE TYPE import_rows_category AS ENUM ('ready', 'existing', 'error', 'duplicate', 'ignored');
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE import_jobs IS 'Import Excel.';
--> statement-breakpoint
COMMENT ON COLUMN import_jobs.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN import_jobs.project_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN import_jobs.status IS 'uploaded · mapped · validated · importing · completed · failed';
--> statement-breakpoint
COMMENT ON COLUMN import_jobs.counts IS 'ready · existing · errors · duplicates · imported';
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE import_rows IS 'Lignes d''un import, éditables avant validation.';
--> statement-breakpoint
COMMENT ON COLUMN import_rows.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN import_rows.category IS 'ready · existing · error · duplicate · ignored';
--> statement-breakpoint
ALTER TABLE import_jobs ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE import_jobs ADD FOREIGN KEY (source_file_id) REFERENCES files(id);
--> statement-breakpoint
ALTER TABLE import_jobs ADD FOREIGN KEY (created_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE import_rows ADD FOREIGN KEY (import_job_id) REFERENCES import_jobs(id);
--> statement-breakpoint
ALTER TABLE import_rows ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
-- RLS (architecture/02).
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON import_jobs
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE import_rows FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON import_rows
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
