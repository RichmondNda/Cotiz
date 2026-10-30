-- Lot 2.4 · étape 1 : tables payments et allocations (module ledger, docs/specs/schema.sql, « lot 2.4 »).
-- RLS : l'association (tenant_isolation) ; le souscripteur lit ses paiements et leurs répartitions, déclare un paiement
-- en attente sans relecture et ne fait que proposer une répartition sur son paiement en attente (lot 3.3). Aucune
-- politique system : aucune tâche du worker ne lit les paiements.
-- schema.sql modifié avec accord (choix C1–C3 du lot 2.4, puis durcissements A–D après relecture) :
-- - index unique partiel allocations_live au lieu de UNIQUE (payment_id, installment_id) : § 4.5 annule les propositions
--   puis confirme sur les mêmes échéances ;
-- - clés composites : un paiement reprend l'association, le projet et la personne de son inscription, un moyen de son
--   association ; une répartition porte sur une échéance de l'inscription de son paiement (allocations.enrollment_id) ;
-- - répartitions vérifiées au COMMIT d'après l'état final du paiement, sur les deux tables (check_payment_allocations) ;
-- - déclaration immuable, transitions de statut, paiement rejeté ou annulé figé (payments_guard), relecteur et motif
--   obligatoires ; une répartition ne change que vers voided (allocations_guard) ; preuve de la personne ou de
--   l'association (check_payment_proof) ;
-- - politiques souscripteur restreintes ; clé d'idempotence unique par personne ; TRUNCATE refusé sur installments,
--   payments et allocations ; cotiz_platform sans écriture.

CREATE TYPE payments_status AS ENUM ('pending', 'validated', 'rejected', 'canceled');
--> statement-breakpoint
CREATE TYPE allocations_state AS ENUM ('proposed', 'confirmed', 'voided');
--> statement-breakpoint
-- Cible des clés composites des répartitions.
ALTER TABLE installments ADD UNIQUE (id, association_id, enrollment_id);
--> statement-breakpoint
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
  idempotency_key text NOT NULL,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, association_id, enrollment_id),
  UNIQUE (user_id, idempotency_key)
);
--> statement-breakpoint
COMMENT ON TABLE payments IS 'Un paiement déclaré par un souscripteur (un virement réel).';
--> statement-breakpoint
COMMENT ON COLUMN payments.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN payments.amount_received IS 'saisi par le gestionnaire si différent';
--> statement-breakpoint
COMMENT ON COLUMN payments.paid_on IS 'date du virement selon le souscripteur';
--> statement-breakpoint
COMMENT ON COLUMN payments.proof_file_id IS 'preuve OU référence obligatoire';
--> statement-breakpoint
COMMENT ON COLUMN payments.status IS 'pending · validated · rejected · canceled';
--> statement-breakpoint
COMMENT ON COLUMN payments.idempotency_key IS 'évite les doubles déclarations sur réseau mobile instable (unique par personne)';
--> statement-breakpoint
COMMENT ON COLUMN payments.version IS 'verrouillage optimiste';
--> statement-breakpoint
CREATE TABLE allocations (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  installment_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  amount bigint NOT NULL,
  state allocations_state NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount > 0)
);
--> statement-breakpoint
COMMENT ON TABLE allocations IS 'Répartition d''un paiement sur une ou plusieurs échéances.';
--> statement-breakpoint
COMMENT ON COLUMN allocations.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN allocations.enrollment_id IS 'inscription du paiement, reprise pour que l''échéance soit de la même inscription (clés composites)';
--> statement-breakpoint
COMMENT ON COLUMN allocations.amount IS '> 0';
--> statement-breakpoint
COMMENT ON COLUMN allocations.state IS 'proposed (par le souscripteur) · confirmed (validé) · voided';
--> statement-breakpoint
ALTER TABLE payments ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE payments ADD FOREIGN KEY (project_id) REFERENCES projects(id);
--> statement-breakpoint
ALTER TABLE payments ADD FOREIGN KEY (enrollment_id, association_id, project_id, user_id)
  REFERENCES enrollments(id, association_id, project_id, user_id);
--> statement-breakpoint
ALTER TABLE payments ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE payments ADD FOREIGN KEY (payment_method_id, association_id) REFERENCES association_payment_methods(id, association_id);
--> statement-breakpoint
ALTER TABLE payments ADD FOREIGN KEY (proof_file_id) REFERENCES files(id);
--> statement-breakpoint
ALTER TABLE payments ADD FOREIGN KEY (reviewed_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE allocations ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE allocations ADD FOREIGN KEY (payment_id, association_id, enrollment_id)
  REFERENCES payments(id, association_id, enrollment_id);
--> statement-breakpoint
ALTER TABLE allocations ADD FOREIGN KEY (installment_id, association_id, enrollment_id)
  REFERENCES installments(id, association_id, enrollment_id);
--> statement-breakpoint
CREATE TRIGGER payments_touch BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
-- Répartitions vérifiées au COMMIT (schema.sql § 3).
CREATE FUNCTION check_payment_allocations() RETURNS trigger LANGUAGE plpgsql AS
$$ DECLARE pid uuid; p payments; confirmed bigint; proposed int; BEGIN
  IF TG_TABLE_NAME = 'payments' THEN pid := NEW.id; ELSE pid := NEW.payment_id; END IF;
  SELECT * INTO p FROM payments WHERE id = pid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(sum(amount) FILTER (WHERE state = 'confirmed'), 0), count(*) FILTER (WHERE state = 'proposed')
    INTO confirmed, proposed FROM allocations WHERE payment_id = pid;
  IF p.status = 'validated' AND confirmed <> coalesce(p.amount_received, p.amount_declared) THEN
    RAISE EXCEPTION 'allocation_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF (p.status = 'validated' AND proposed > 0) OR (p.status = 'pending' AND confirmed > 0)
     OR (p.status IN ('rejected', 'canceled') AND (confirmed > 0 OR proposed > 0)) THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER payments_allocations_sum AFTER INSERT OR UPDATE ON payments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_payment_allocations();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER allocations_payment_check AFTER INSERT OR UPDATE ON allocations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_payment_allocations();
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_positive CHECK (amount_declared > 0 AND (amount_received IS NULL OR amount_received > 0));
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_proof_or_reference CHECK (proof_file_id IS NOT NULL OR transaction_reference IS NOT NULL);
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_reviewed CHECK (status NOT IN ('validated', 'rejected') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL));
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_rejection_reason CHECK (status <> 'rejected' OR rejection_reason_code IS NOT NULL);
--> statement-breakpoint
-- Déclaration immuable, transitions de domain-rules § 8 (schema.sql § 7).
CREATE FUNCTION guard_payment_update() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF OLD.status IN ('rejected', 'canceled') AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = 'P0001';
  END IF;
  IF (to_jsonb(NEW) - 'amount_received' - 'status' - 'reviewed_by' - 'reviewed_at' - 'rejection_reason_code'
        - 'rejection_message' - 'version' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'amount_received' - 'status' - 'reviewed_by' - 'reviewed_at' - 'rejection_reason_code'
        - 'rejection_message' - 'version' - 'updated_at') THEN
    RAISE EXCEPTION 'forbidden_update' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'pending' AND NEW.status IN ('validated', 'rejected', 'canceled'))
       OR (OLD.status = 'validated' AND NEW.status = 'pending')) THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payments_guard BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION guard_payment_update();
--> statement-breakpoint
CREATE FUNCTION guard_allocation_update() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF (to_jsonb(NEW) - 'state') IS DISTINCT FROM (to_jsonb(OLD) - 'state') THEN
    RAISE EXCEPTION 'forbidden_update' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.state <> OLD.state AND NOT (OLD.state IN ('proposed', 'confirmed') AND NEW.state = 'voided') THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER allocations_guard BEFORE UPDATE ON allocations FOR EACH ROW EXECUTE FUNCTION guard_allocation_update();
--> statement-breakpoint
-- Preuve de la personne ou de l'association (schema.sql § 8).
CREATE FUNCTION check_payment_proof() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF NEW.proof_file_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM files f
        WHERE f.id = NEW.proof_file_id AND f.purpose = 'payment_proof'
          AND (f.association_id = NEW.association_id OR (f.association_id IS NULL AND f.owner_user_id = NEW.user_id))) THEN
    RAISE EXCEPTION 'invalid_proof' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payments_proof BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION check_payment_proof();
--> statement-breakpoint
-- Données financières : TRUNCATE refusé.
CREATE TRIGGER installments_no_truncate BEFORE TRUNCATE ON installments FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER payments_no_truncate BEFORE TRUNCATE ON payments FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER allocations_no_truncate BEFORE TRUNCATE ON allocations FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
-- Index des requêtes chaudes (architecture/09).
CREATE INDEX payments_queue ON payments (association_id, declared_at) WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX payments_self ON payments (user_id, declared_at DESC);
--> statement-breakpoint
CREATE INDEX allocations_installment ON allocations (installment_id);
--> statement-breakpoint
-- Une seule répartition vivante par paiement et par échéance.
CREATE UNIQUE INDEX allocations_live ON allocations (payment_id, installment_id) WHERE state <> 'voided';
--> statement-breakpoint
-- Données financières : ni paiement ni répartition ne se suppriment (annulation = opération compensatoire).
REVOKE DELETE ON payments, allocations FROM cotiz_app, cotiz_platform;
--> statement-breakpoint
-- Jamais écrits sous /platform.
REVOKE INSERT, UPDATE ON payments, allocations FROM cotiz_platform;
--> statement-breakpoint
-- RLS (architecture/02).
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON payments
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY subscriber_self_read ON payments FOR SELECT
  USING (user_id = app_user_id() AND app_space() = 'subscriber');
--> statement-breakpoint
-- Une déclaration naît en attente, sans relecture, datée de sa transaction (lot 3.3).
CREATE POLICY subscriber_declare ON payments FOR INSERT
  WITH CHECK (user_id = app_user_id() AND app_space() = 'subscriber' AND status = 'pending' AND version = 1
              AND declared_at = now() AND amount_received IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL
              AND rejection_reason_code IS NULL AND rejection_message IS NULL);
--> statement-breakpoint
-- allocations
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE allocations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON allocations
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
-- Le souscripteur lit les répartitions de ses paiements et ne fait que proposer, sur son paiement en attente (lot 3.3) :
-- jamais de confirmation ni de modification.
CREATE POLICY subscriber_self_read ON allocations FOR SELECT
  USING (app_space() = 'subscriber' AND EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id AND p.user_id = app_user_id()));
--> statement-breakpoint
CREATE POLICY subscriber_propose ON allocations FOR INSERT
  WITH CHECK (app_space() = 'subscriber' AND state = 'proposed'
              AND EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id AND p.user_id = app_user_id() AND p.status = 'pending'));
