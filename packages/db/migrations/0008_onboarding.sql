-- Lot 1.3 · étape 1 : table onboarding (association_requests ; docs/specs/schema.sql, « lot 1.3 »).
-- Demandes du formulaire public : déposées en espace public (public_submit, INSERT seul, sans RETURNING), lues et
-- traitées par la plateforme (cotiz_platform). Référence DEM-<année>-<numéro> tirée d'une séquence globale.
-- Associations : numéro d'enregistrement repris de la demande ou saisi à la création directe.

CREATE TYPE association_requests_estimated_subscribers AS ENUM ('1_20', '21_50', '51_200', '201_500', '500_plus');
--> statement-breakpoint
CREATE TYPE association_requests_status AS ENUM ('pending', 'approved', 'rejected');
--> statement-breakpoint
CREATE SEQUENCE association_request_number_seq;
--> statement-breakpoint
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
--> statement-breakpoint
COMMENT ON TABLE association_requests IS 'Demandes de création issues du formulaire public.';
--> statement-breakpoint
COMMENT ON COLUMN association_requests.reference IS 'DEM-2026-00042, affichée sur la confirmation';
--> statement-breakpoint
COMMENT ON COLUMN association_requests.activity_description IS '500 caractères max';
--> statement-breakpoint
COMMENT ON COLUMN association_requests.estimated_subscribers IS '1_20 · 21_50 · 51_200 · 201_500 · 500_plus';
--> statement-breakpoint
COMMENT ON COLUMN association_requests.terms_accepted_at IS 'preuve d''acceptation des CGU';
--> statement-breakpoint
COMMENT ON COLUMN association_requests.status IS 'pending · approved · rejected';
--> statement-breakpoint
COMMENT ON COLUMN association_requests.viewed_at IS 'première ouverture par la plateforme (frise « Consultée »)';
--> statement-breakpoint
COMMENT ON COLUMN association_requests.internal_note IS 'jamais visible par la candidate';
--> statement-breakpoint
COMMENT ON COLUMN association_requests.association_id IS 'association créée à l''approbation';
--> statement-breakpoint
ALTER TABLE association_requests ADD FOREIGN KEY (desired_plan_id) REFERENCES plans(id);
--> statement-breakpoint
ALTER TABLE association_requests ADD FOREIGN KEY (viewed_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE association_requests ADD FOREIGN KEY (decided_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE association_requests ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
CREATE INDEX association_requests_queue ON association_requests (status, created_at);
--> statement-breakpoint
-- RLS (architecture/02) : dépôt en espace public seulement, d'une demande en attente sans décision ni consultation ;
-- aucune lecture par cotiz_app.
ALTER TABLE association_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE association_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY public_submit ON association_requests FOR INSERT
  WITH CHECK (app_space() = 'public' AND status = 'pending' AND viewed_by IS NULL AND viewed_at IS NULL
              AND decided_by IS NULL AND decided_at IS NULL AND rejection_reason_code IS NULL
              AND rejection_message IS NULL AND internal_note IS NULL AND association_id IS NULL);
--> statement-breakpoint
ALTER TABLE associations ADD COLUMN registration_number text;
--> statement-breakpoint
COMMENT ON COLUMN associations.registration_number IS 'facultatif, repris de la demande';
--> statement-breakpoint
-- Droits : une demande (preuve de l'acceptation des CGU) ne se supprime jamais.
REVOKE DELETE ON association_requests FROM cotiz_app, cotiz_platform;
