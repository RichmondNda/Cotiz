-- Accord de l'utilisateur (2026-11-10) : le retard d'une échéance déjà passée à la signature du contrat part du jour de
-- la signature (plus le délai de grâce), pas de son échéance ; me.declare refusait tout paiement avant la signature.
-- Posée par le consommateur contract-schedule (members) ; null : le retard part de l'échéance (domain-rules § 6,
-- lateStart de @cotiz/domain). Colonne ajoutée à docs/specs/schema.sql.
ALTER TABLE installments ADD COLUMN late_from date;
--> statement-breakpoint
COMMENT ON COLUMN installments.late_from IS 'départ du retard s''il est postérieur à l''échéance (jour de la signature du contrat) ; null : échéance';
--> statement-breakpoint
ALTER TABLE installments ADD CONSTRAINT installments_late_from_after_due CHECK (late_from IS NULL OR late_from > due_date);
