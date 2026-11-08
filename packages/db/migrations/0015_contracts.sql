-- Lot 4.1 · étape 1 : tables contracts et contract_signatures (docs/specs/schema.sql, « lot 4.1 »).
-- Un contrat verrouillé ne se modifie plus (contracts_locked) ; une signature ne se modifie ni ne se supprime
-- (droits retirés, déclencheurs forbid_mutation, TRUNCATE compris : annoncé par la migration 0002).
-- RLS : l'association ; le souscripteur lit le contrat des projets où il est inscrit, ses propres signatures, et
-- n'insère que la sienne. Resserré par rapport à la première cible (accord de l'utilisateur, 2026-11-08) : clé
-- composite du projet, une signature par inscription et par PDF, subscriber_sign lié à l'inscription, au contrat
-- verrouillé et à un PDF neuf, seul le souscripteur signe (subscriber_insert_only, restrictive) ; politiques files du
-- PDF signé (lecture, et création à la clé imposée pour une inscription en attente).

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
--> statement-breakpoint
COMMENT ON TABLE contracts IS 'Contrat d''un projet. Immuable une fois verrouillé.';
--> statement-breakpoint
COMMENT ON COLUMN contracts.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN contracts.body_template IS 'Markdown avec variables {nom_souscripteur}, {montant}…';
--> statement-breakpoint
COMMENT ON COLUMN contracts.template_sha256 IS 'empreinte du modèle verrouillé';
--> statement-breakpoint
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
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id),
  UNIQUE (pdf_file_id)
);
--> statement-breakpoint
COMMENT ON TABLE contract_signatures IS 'Contre-signature d''un souscripteur, avec éléments de preuve.';
--> statement-breakpoint
COMMENT ON COLUMN contract_signatures.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN contract_signatures.rendered_sha256 IS 'empreinte du contrat personnalisé tel qu''affiché';
--> statement-breakpoint
COMMENT ON COLUMN contract_signatures.consent_text IS '« J''ai lu et j''accepte… » exact au moment de la signature';
--> statement-breakpoint
COMMENT ON COLUMN contract_signatures.pdf_file_id IS 'PDF signé avec page de preuve';
--> statement-breakpoint
COMMENT ON COLUMN contract_signatures.enrollment_id IS 'une signature par inscription';
--> statement-breakpoint
ALTER TABLE contracts ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
-- Le projet du contrat est de la même association (comme enrollments, lot 2.3).
ALTER TABLE contracts ADD FOREIGN KEY (project_id, association_id) REFERENCES projects(id, association_id);
--> statement-breakpoint
ALTER TABLE contracts ADD FOREIGN KEY (association_signed_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE contract_signatures ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE contract_signatures ADD FOREIGN KEY (contract_id) REFERENCES contracts(id);
--> statement-breakpoint
ALTER TABLE contract_signatures ADD FOREIGN KEY (enrollment_id) REFERENCES enrollments(id);
--> statement-breakpoint
ALTER TABLE contract_signatures ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE contract_signatures ADD FOREIGN KEY (pdf_file_id) REFERENCES files(id);
--> statement-breakpoint
-- Un contrat verrouillé ne se modifie plus.
CREATE FUNCTION forbid_locked_contract_update() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF OLD.locked_at IS NOT NULL THEN RAISE EXCEPTION 'contract_locked' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER contracts_locked BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION forbid_locked_contract_update();
--> statement-breakpoint
-- Signatures en ajout seul (comme audit_logs) : TRUNCATE ignore la RLS et les déclencheurs de ligne.
CREATE TRIGGER signatures_append_only BEFORE UPDATE OR DELETE ON contract_signatures FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER signatures_no_truncate BEFORE TRUNCATE ON contract_signatures FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
REVOKE UPDATE, DELETE ON contract_signatures FROM cotiz_app, cotiz_platform;
--> statement-breakpoint
-- RLS (architecture/02).
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON contracts
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY subscriber_enrolled_read ON contracts FOR SELECT
  USING (app_space() = 'subscriber' AND EXISTS (SELECT 1 FROM enrollments e WHERE e.project_id = contracts.project_id AND e.association_id = contracts.association_id AND e.user_id = app_user_id()));
--> statement-breakpoint
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contract_signatures FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON contract_signatures
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY subscriber_self_read ON contract_signatures FOR SELECT
  USING (user_id = app_user_id() AND app_space() = 'subscriber');
--> statement-breakpoint
-- Seul le souscripteur signe : restrictive, elle s'ajoute par ET à tenant_isolation, qu'un gestionnaire ne puisse ni
-- signer à la place d'un souscripteur ni bloquer une inscription d'une autre association (UNIQUE).
CREATE POLICY subscriber_insert_only ON contract_signatures AS RESTRICTIVE FOR INSERT
  WITH CHECK (app_space() = 'subscriber');
--> statement-breakpoint
-- Sa propre inscription en attente de signature, le contrat verrouillé de son projet, son propre PDF de contrat
-- dans la même association.
CREATE POLICY subscriber_sign ON contract_signatures FOR INSERT
  WITH CHECK (user_id = app_user_id() AND app_space() = 'subscriber'
              AND EXISTS (SELECT 1 FROM enrollments e JOIN contracts c ON c.project_id = e.project_id AND c.association_id = e.association_id
                           WHERE e.id = contract_signatures.enrollment_id AND e.user_id = app_user_id()
                             AND e.association_id = contract_signatures.association_id AND e.status = 'pending_signature'
                             AND c.id = contract_signatures.contract_id AND c.locked_at IS NOT NULL)
              AND EXISTS (SELECT 1 FROM files f
                           WHERE f.id = contract_signatures.pdf_file_id AND f.owner_user_id = app_user_id()
                             AND f.purpose = 'contract_pdf' AND f.association_id = contract_signatures.association_id
                             AND f.scan_status = 'pending' AND f.sha256 IS NULL));
--> statement-breakpoint
-- PDF de son contrat signé : le souscripteur le lit, et le crée en attente (complété par le worker), à la clé d'objet
-- imposée, pour une association où une inscription attend sa signature ; jamais de modification ni de suppression.
CREATE POLICY subscriber_contract_pdf_read ON files FOR SELECT
  USING (app_space() = 'subscriber' AND owner_user_id = app_user_id() AND purpose = 'contract_pdf');
--> statement-breakpoint
CREATE POLICY subscriber_contract_pdf_create ON files FOR INSERT
  WITH CHECK (app_space() = 'subscriber' AND owner_user_id = app_user_id() AND purpose = 'contract_pdf'
              AND scan_status = 'pending' AND sha256 IS NULL AND expires_at IS NULL AND bucket = 'cotiz-legal'
              AND object_key = association_id::text || '/contract_pdf/' || id::text || '.pdf'
              AND EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = app_user_id() AND e.association_id = files.association_id
                            AND e.status = 'pending_signature'));
