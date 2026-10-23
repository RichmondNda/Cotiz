-- Lot 1.4 : plans en F CFA (XOF) seulement, devise de la plateforme (revenu mensuel du tableau de bord, factures).
-- Le contrat (PlanInput) refuse déjà une autre devise ; la contrainte protège aussi des écritures hors API.
ALTER TABLE plans ADD CONSTRAINT plans_currency_xof CHECK (currency = 'XOF');
--> statement-breakpoint
COMMENT ON COLUMN plans.currency IS 'XOF seulement (plans_currency_xof)';
