-- Suite de 0021 (une seule devise, XOF, décision de l'utilisateur du 2026-11-11), relevé par money-reviewer : la
-- devise d'un paiement est recopiée de son projet (me.declare), la contrainte protège des écritures hors API.
ALTER TABLE payments ADD CONSTRAINT payments_currency_xof CHECK (currency = 'XOF');
--> statement-breakpoint
COMMENT ON COLUMN projects.currency IS 'XOF seulement pour l''instant (projects_currency_xof)';
