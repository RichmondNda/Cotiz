-- Lot 0.5 · étape 3 : files, référentiel des fichiers stockés dans MinIO (docs/specs/schema.sql, « lot 0.5 »).
-- Clés étrangères vers users (lot 1.1) et associations (lot 1.2) : posées par la migration du lot qui crée la table.

CREATE TYPE files_purpose AS ENUM ('payment_proof', 'contract_pdf', 'invoice_pdf', 'export', 'logo', 'cover', 'import_source', 'bank_statement');
--> statement-breakpoint
CREATE TYPE files_scan_status AS ENUM ('pending', 'clean', 'infected');
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE files IS 'Référentiel de tous les fichiers stockés dans MinIO.';
--> statement-breakpoint
COMMENT ON COLUMN files.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN files.purpose IS 'payment_proof · contract_pdf · invoice_pdf · export · logo · cover · import_source · bank_statement';
--> statement-breakpoint
COMMENT ON COLUMN files.bucket IS '{association_id}/{purpose}/{uuid}.{ext}';
--> statement-breakpoint
COMMENT ON COLUMN files.object_key IS '{association_id}/{purpose}/{uuid}.{ext}';
--> statement-breakpoint
COMMENT ON COLUMN files.original_name IS 'nom du fichier déposé (affichage seulement, jamais utilisé comme clé)';
--> statement-breakpoint
COMMENT ON COLUMN files.mime_type IS 'vérifiés sur le contenu réel';
--> statement-breakpoint
COMMENT ON COLUMN files.size_bytes IS 'vérifiés sur le contenu réel';
--> statement-breakpoint
COMMENT ON COLUMN files.sha256 IS 'intégrité et preuve ; calculé par le worker, NULL tant que scan_status = pending';
--> statement-breakpoint
COMMENT ON COLUMN files.scan_status IS 'pending · clean · infected';
--> statement-breakpoint

-- RLS : l'association (gestionnaires), le déposant dans son espace souscripteur (sa preuve ; il ne la rattache jamais
-- lui-même à une association), le worker (analyse, ménage).
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE files FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON files
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY owner_access ON files
  USING (app_space() = 'subscriber' AND owner_user_id = app_user_id() AND purpose = 'payment_proof')
  WITH CHECK (app_space() = 'subscriber' AND owner_user_id = app_user_id() AND purpose = 'payment_proof'
              AND association_id IS NULL);
--> statement-breakpoint
CREATE POLICY system_access ON files
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
