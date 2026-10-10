-- Lot 1.1 · étape 1 : identité (users, credentials, sessions, one_time_codes, password_reset_requests) et personnel
-- de la plateforme (platform_staff), d'après docs/specs/schema.sql (« lot 1.1 »).
-- Clés étrangères vers associations (one_time_codes, password_reset_requests) : posées au lot 1.2.

CREATE TYPE users_status AS ENUM ('pending_activation', 'active', 'locked', 'disabled', 'anonymized');
--> statement-breakpoint
CREATE TYPE sessions_space AS ENUM ('platform', 'association', 'subscriber');
--> statement-breakpoint
CREATE TYPE one_time_codes_purpose AS ENUM ('activation', 'password_reset', 'staff_invite', 'team_invite');
--> statement-breakpoint
CREATE TYPE one_time_codes_delivery AS ENUM ('manual', 'sms', 'email');
--> statement-breakpoint
CREATE TYPE platform_staff_role AS ENUM ('owner', 'admin', 'support');
--> statement-breakpoint
CREATE TYPE password_reset_requests_space AS ENUM ('association', 'subscriber', 'platform');
--> statement-breakpoint
CREATE TYPE password_reset_requests_status AS ENUM ('pending', 'code_issued', 'completed', 'expired', 'dismissed');
--> statement-breakpoint

CREATE TABLE users (
  id uuid PRIMARY KEY,
  phone_e164 text UNIQUE,
  email citext UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  status users_status NOT NULL DEFAULT 'pending_activation',
  must_change_password boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'fr-CI',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  anonymized_at timestamptz,
  version int NOT NULL DEFAULT 1
);
--> statement-breakpoint
COMMENT ON TABLE users IS 'Toute personne qui se connecte : super-admin, gestionnaire ou souscripteur. Une seule identité par personne, quel que soit le nombre d''associations.';
--> statement-breakpoint
COMMENT ON COLUMN users.id IS 'UUID v7 (triable par date)';
--> statement-breakpoint
COMMENT ON COLUMN users.phone_e164 IS '+2250708091011 — identifiant de connexion du souscripteur, clé de dédoublonnage';
--> statement-breakpoint
COMMENT ON COLUMN users.email IS 'identifiant de connexion gestionnaire / super-admin';
--> statement-breakpoint
COMMENT ON COLUMN users.status IS 'pending_activation · active · locked · disabled · anonymized';
--> statement-breakpoint
COMMENT ON COLUMN users.must_change_password IS 'vrai tant que l''activation n''est pas faite';
--> statement-breakpoint
COMMENT ON COLUMN users.locale IS 'fr-CI par défaut';
--> statement-breakpoint
COMMENT ON COLUMN users.anonymized_at IS 'effacement RGPD : identité remplacée, historique financier conservé';
--> statement-breakpoint
COMMENT ON COLUMN users.version IS 'verrouillage optimiste';
--> statement-breakpoint

CREATE TABLE credentials (
  user_id uuid PRIMARY KEY,
  password_hash text,
  password_changed_at timestamptz,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz
);
--> statement-breakpoint
COMMENT ON TABLE credentials IS 'Secrets d''authentification, séparés de l''identité pour limiter leur exposition.';
--> statement-breakpoint
COMMENT ON COLUMN credentials.password_hash IS 'argon2id';
--> statement-breakpoint
COMMENT ON COLUMN credentials.failed_attempts IS 'remis à zéro à la connexion réussie';
--> statement-breakpoint
COMMENT ON COLUMN credentials.locked_until IS 'verrouillage 15 min après 5 échecs';
--> statement-breakpoint

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  refresh_token_hash text NOT NULL,
  family_id uuid NOT NULL,
  space sessions_space NOT NULL,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
--> statement-breakpoint
COMMENT ON TABLE sessions IS 'Sessions de connexion (jetons de rafraîchissement).';
--> statement-breakpoint
COMMENT ON COLUMN sessions.refresh_token_hash IS 'SHA-256 du jeton, jamais le jeton lui-même';
--> statement-breakpoint
COMMENT ON COLUMN sessions.family_id IS 'détection de réutilisation : toute la famille est révoquée';
--> statement-breakpoint
COMMENT ON COLUMN sessions.space IS 'platform · association · subscriber';
--> statement-breakpoint

CREATE TABLE one_time_codes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  purpose one_time_codes_purpose NOT NULL,
  delivery one_time_codes_delivery NOT NULL DEFAULT 'manual',
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  association_id uuid,
  code_encrypted bytea,
  issued_by uuid,
  handed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
COMMENT ON TABLE one_time_codes IS 'Codes d''activation, de réinitialisation et d''invitation. Sans fournisseur : le code est remis par une personne (gestionnaire, super-admin).';
--> statement-breakpoint
COMMENT ON COLUMN one_time_codes.purpose IS 'activation · password_reset · staff_invite · team_invite';
--> statement-breakpoint
COMMENT ON COLUMN one_time_codes.delivery IS 'manual · sms · email — manual tant que le groupe 6 n''est pas activé';
--> statement-breakpoint
COMMENT ON COLUMN one_time_codes.code_hash IS 'activation/invitation : 8 caractères sans ambiguïté (ex. K7M4P9QX) ; réinitialisation : 6 chiffres — toujours haché (argon2id)';
--> statement-breakpoint
COMMENT ON COLUMN one_time_codes.attempts IS 'maximum 5';
--> statement-breakpoint
COMMENT ON COLUMN one_time_codes.expires_at IS 'activation 72 h, réinitialisation 15 min';
--> statement-breakpoint
COMMENT ON COLUMN one_time_codes.consumed_at IS 'activation 72 h, réinitialisation 15 min';
--> statement-breakpoint
COMMENT ON COLUMN one_time_codes.association_id IS 'RLS : association qui a émis le code (NULL si émis par la plateforme)';
--> statement-breakpoint
COMMENT ON COLUMN one_time_codes.code_encrypted IS 'activation uniquement : chiffré AES-256-GCM (clé applicative) pour ré-affichage au gestionnaire jusqu''à consommation ; effacé à la consommation ou l''expiration';
--> statement-breakpoint
COMMENT ON COLUMN one_time_codes.issued_by IS 'personne qui a généré le code';
--> statement-breakpoint
COMMENT ON COLUMN one_time_codes.handed_at IS 'marqué « remis » par le gestionnaire';
--> statement-breakpoint

CREATE TABLE platform_staff (
  user_id uuid PRIMARY KEY,
  role platform_staff_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
COMMENT ON TABLE platform_staff IS 'Personnel de la plateforme Cotiz.';
--> statement-breakpoint
COMMENT ON COLUMN platform_staff.role IS 'owner · admin · support';
--> statement-breakpoint

CREATE TABLE password_reset_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  association_id uuid,
  space password_reset_requests_space NOT NULL,
  status password_reset_requests_status NOT NULL DEFAULT 'pending',
  code_id uuid,
  handled_by uuid,
  handled_at timestamptz,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
COMMENT ON TABLE password_reset_requests IS 'Demandes « mot de passe oublié ». Sans fournisseur, elles sont traitées par le rôle supérieur qui émet un code.';
--> statement-breakpoint
COMMENT ON COLUMN password_reset_requests.association_id IS 'RLS : association du souscripteur qui traite la demande ; NULL = traité par la plateforme (gestionnaires)';
--> statement-breakpoint
COMMENT ON COLUMN password_reset_requests.space IS 'association · subscriber · platform';
--> statement-breakpoint
COMMENT ON COLUMN password_reset_requests.status IS 'pending · code_issued · completed · expired · dismissed';
--> statement-breakpoint

-- Clés étrangères vers users, dont celle de files (lot 0.5).
ALTER TABLE credentials ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE sessions ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE one_time_codes ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE one_time_codes ADD FOREIGN KEY (issued_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE platform_staff ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE files ADD FOREIGN KEY (owner_user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE password_reset_requests ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE password_reset_requests ADD FOREIGN KEY (code_id) REFERENCES one_time_codes(id);
--> statement-breakpoint
ALTER TABLE password_reset_requests ADD FOREIGN KEY (handled_by) REFERENCES users(id);
--> statement-breakpoint

-- updated_at automatique (schema.sql, invariant 1).
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
--> statement-breakpoint
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint

-- Index des requêtes chaudes (architecture/09-cache-performance.md).
CREATE INDEX users_name_trgm ON users USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX codes_pending ON one_time_codes (association_id, purpose) WHERE consumed_at IS NULL;
--> statement-breakpoint
CREATE INDEX resets_pending ON password_reset_requests (association_id, created_at) WHERE status = 'pending';
--> statement-breakpoint

-- RLS. users, credentials, sessions, platform_staff : tables globales sans RLS, accès limité au module identity
-- (architecture/02). one_time_codes et password_reset_requests : l'association qui a émis le code ou traite la
-- demande, et le module identity avant authentification (auth) ou le worker (system).
ALTER TABLE one_time_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE one_time_codes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_manage ON one_time_codes
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY auth_access ON one_time_codes
  USING (app_space() IN ('auth', 'system'))
  WITH CHECK (app_space() IN ('auth', 'system'));
--> statement-breakpoint
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE password_reset_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_manage ON password_reset_requests
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY auth_access ON password_reset_requests
  USING (app_space() IN ('auth', 'system'))
  WITH CHECK (app_space() IN ('auth', 'system'));
