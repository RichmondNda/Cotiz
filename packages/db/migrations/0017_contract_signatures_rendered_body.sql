-- Lot 4.1 · étape 4 : texte du contrat personnalisé figé à la signature, reproduit tel quel dans le PDF (un changement
-- de nom du souscripteur ou de l'association après la signature ne change plus le document signé).
-- Colonne ajoutée à docs/specs/schema.sql avec l'accord de l'utilisateur (2026-11-08) : la migration 0015 est commitée.
-- Aucune signature n'existe encore en dehors des bases de développement : vider la table d'une base de dev si besoin.
ALTER TABLE contract_signatures ADD COLUMN rendered_body text NOT NULL;
--> statement-breakpoint
COMMENT ON COLUMN contract_signatures.rendered_body IS 'texte du contrat personnalisé tel que signé (empreinte rendered_sha256), reproduit dans le PDF';
