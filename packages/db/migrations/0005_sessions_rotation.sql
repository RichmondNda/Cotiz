-- Lot 1.1 · étape 3 : renouvellement des sessions (rotation, révocation de la famille).
-- remember_me : « Rester connecté » choisi à la connexion, recopié à chaque rotation (cookie persistant ou de session).
-- Index : jeton présenté (recherche par empreinte, unique), famille (révocation), sessions actives d'une personne
-- (révocation de toutes ses sessions au changement de mot de passe, étape 8).
ALTER TABLE sessions ADD COLUMN remember_me boolean NOT NULL DEFAULT false;
--> statement-breakpoint
COMMENT ON COLUMN sessions.remember_me IS '« Rester connecté » : cookie de renouvellement persistant (30 jours) sinon de session, recopié à chaque rotation';
--> statement-breakpoint
CREATE UNIQUE INDEX sessions_refresh_token ON sessions (refresh_token_hash);
--> statement-breakpoint
CREATE INDEX sessions_family ON sessions (family_id);
--> statement-breakpoint
CREATE INDEX sessions_user_active ON sessions (user_id) WHERE revoked_at IS NULL;
