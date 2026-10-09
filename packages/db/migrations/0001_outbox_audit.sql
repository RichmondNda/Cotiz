-- Lot 0.5 · étape 1 : outbox_events et audit_logs (docs/specs/schema.sql, rechercher « lot 0.5 »).

-- outbox_events · module outbox : événements de domaine en attente de publication.
CREATE TABLE outbox_events (
  id bigserial PRIMARY KEY,
  association_id uuid,
  actor_user_id uuid,
  event_type text NOT NULL,
  event_version int NOT NULL DEFAULT 1,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
COMMENT ON TABLE outbox_events IS 'Événements de domaine en attente de publication.';
--> statement-breakpoint
COMMENT ON COLUMN outbox_events.actor_user_id IS 'auteur de l''action (actorUserId de l''enveloppe) ; NULL pour une tâche système';
--> statement-breakpoint
COMMENT ON COLUMN outbox_events.event_type IS 'payment.validated';
--> statement-breakpoint

-- audit_logs · module audit : journal d'audit, en ajout seul.
CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_role text NOT NULL,
  association_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  request_id text,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
COMMENT ON TABLE audit_logs IS 'Journal d''audit, en ajout seul.';
--> statement-breakpoint
COMMENT ON COLUMN audit_logs.action IS 'payment.validate, association.suspend…';
--> statement-breakpoint
COMMENT ON COLUMN audit_logs.before IS 'champs modifiés uniquement';
--> statement-breakpoint
COMMENT ON COLUMN audit_logs.after IS 'champs modifiés uniquement';
--> statement-breakpoint

-- Journal d'audit en ajout seul : déclencheur (même pour un rôle qui aurait le droit) et droits retirés ci-dessous.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'append_only' USING ERRCODE = 'P0001'; END $$;
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint

-- Index des requêtes chaudes (architecture/09-cache-performance.md).
CREATE INDEX outbox_unpublished ON outbox_events (id) WHERE published_at IS NULL;
--> statement-breakpoint
CREATE INDEX audit_entity ON audit_logs (association_id, entity_type, entity_id, occurred_at DESC);
--> statement-breakpoint

-- RLS. outbox_events : ajout depuis tout contexte (le cas d'usage écrit dans sa transaction), lecture et
-- publication par le relais du worker (espace system) seulement.
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY append ON outbox_events FOR INSERT
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY relay ON outbox_events
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
--> statement-breakpoint

-- audit_logs : ajout depuis tout contexte ; lecture par l'association concernée ou le système.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY append ON audit_logs FOR INSERT
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY tenant_read ON audit_logs FOR SELECT
  USING (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY system_read ON audit_logs FOR SELECT
  USING (app_space() = 'system');
--> statement-breakpoint

-- Droits : les droits par défaut (migration 0000) accordent UPDATE et DELETE ; le journal est en ajout seul.
REVOKE UPDATE, DELETE ON audit_logs FROM cotiz_app, cotiz_platform;
