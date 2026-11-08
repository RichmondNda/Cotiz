-- Lot 4.1 · étape 2 : verrouillage optimiste du contrat (If-Match de ct.get, modification et verrouillage).
-- Colonne ajoutée à docs/specs/schema.sql avec l'accord de l'utilisateur (2026-11-08) : la migration 0015 est commitée.
ALTER TABLE contracts ADD COLUMN version int NOT NULL DEFAULT 1;
--> statement-breakpoint
COMMENT ON COLUMN contracts.version IS 'verrouillage optimiste (If-Match de ct.get : modification et verrouillage)';
