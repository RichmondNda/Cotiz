-- Lot 4.7 · étape 1 : double authentification (mfa_factors). Table globale sans RLS, accès limité au module identity,
-- comme sessions. Colonne recovery_code_hashes : changement de spec accepté le 2026-11-19 (docs/specs/schema.sql).
CREATE TYPE mfa_factors_type AS ENUM ('totp');
--> statement-breakpoint
CREATE TABLE mfa_factors (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  type mfa_factors_type NOT NULL,
  secret_encrypted bytea NOT NULL,
  confirmed_at timestamptz,
  recovery_code_hashes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
COMMENT ON TABLE mfa_factors IS 'Double authentification (obligatoire pour le personnel plateforme).';
--> statement-breakpoint
COMMENT ON COLUMN mfa_factors.type IS 'totp';
--> statement-breakpoint
COMMENT ON COLUMN mfa_factors.secret_encrypted IS 'chiffré côté application';
--> statement-breakpoint
COMMENT ON COLUMN mfa_factors.recovery_code_hashes IS 'codes de secours hachés (argon2id), affichés une fois à la confirmation ; un code utilisé est retiré';
--> statement-breakpoint
ALTER TABLE mfa_factors ADD FOREIGN KEY (user_id) REFERENCES users(id);
