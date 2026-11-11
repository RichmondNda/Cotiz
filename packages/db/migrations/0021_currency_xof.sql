-- Décision de l'utilisateur (2026-11-11, PR C) : une seule devise pour l'instant, le F CFA (XOF), comme les plans
-- (0010). Une personne inscrite dans deux associations ne peut donc pas cumuler deux devises (me.dash additionne ses
-- restes). Aucune route ne choisit la devise (défaut 'XOF') ; la contrainte protège des écritures hors API. Levée plus
-- tard par une nouvelle migration. Contraintes ajoutées à docs/specs/schema.sql.
ALTER TABLE associations ADD CONSTRAINT associations_currency_xof CHECK (currency = 'XOF');
--> statement-breakpoint
COMMENT ON COLUMN associations.currency IS 'XOF seulement pour l''instant (associations_currency_xof)';
--> statement-breakpoint
ALTER TABLE projects ADD CONSTRAINT projects_currency_xof CHECK (currency = 'XOF');
