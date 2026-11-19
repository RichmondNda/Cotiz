-- Lot 4.6 · étape 5 : reçu de paiement (changement de spec accepté le 2026-11-13, docs/specs/schema.sql). Usage de
-- fichier `receipt_pdf` (cotiz-legal, WORM), colonne `payments.receipt_file_id` posée une seule fois sur un paiement
-- validé (payments_guard), lecture du reçu par le souscripteur du paiement (subscriber_receipt_read). La nouvelle
-- valeur d'enum n'est utilisée par aucune instruction de cette migration (même transaction que son ajout).
ALTER TYPE files_purpose ADD VALUE 'receipt_pdf';
--> statement-breakpoint
COMMENT ON COLUMN files.purpose IS 'payment_proof · contract_pdf · invoice_pdf · export · logo · cover · import_source · bank_statement · receipt_pdf';
--> statement-breakpoint
ALTER TABLE payments ADD COLUMN receipt_file_id uuid UNIQUE;
--> statement-breakpoint
COMMENT ON COLUMN payments.receipt_file_id IS 'reçu PDF (lot 4.6) : posé une fois sur un paiement validé, après le délai d''annulation ; jamais régénéré';
--> statement-breakpoint
ALTER TABLE payments ADD FOREIGN KEY (receipt_file_id) REFERENCES files(id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_payment_update() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF OLD.status IN ('rejected', 'canceled') AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = 'P0001';
  END IF;
  IF (to_jsonb(NEW) - 'amount_received' - 'status' - 'reviewed_by' - 'reviewed_at' - 'rejection_reason_code'
        - 'rejection_message' - 'version' - 'updated_at' - 'receipt_file_id')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'amount_received' - 'status' - 'reviewed_by' - 'reviewed_at' - 'rejection_reason_code'
        - 'rejection_message' - 'version' - 'updated_at' - 'receipt_file_id') THEN
    RAISE EXCEPTION 'forbidden_update' USING ERRCODE = 'P0001';
  END IF;
  -- Reçu (lot 4.6) : posé une seule fois, sur un paiement validé qui le reste.
  IF NEW.receipt_file_id IS DISTINCT FROM OLD.receipt_file_id
     AND (OLD.receipt_file_id IS NOT NULL OR OLD.status <> 'validated' OR NEW.status <> 'validated') THEN
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
CREATE POLICY subscriber_receipt_read ON files FOR SELECT
  USING (app_space() = 'subscriber' AND owner_user_id = app_user_id()
         AND EXISTS (SELECT 1 FROM payments p WHERE p.receipt_file_id = files.id AND p.user_id = app_user_id()));
