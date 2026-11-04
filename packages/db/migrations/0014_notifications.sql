-- Lot 2.5 · étape 1 : tables notifications et deliveries (docs/specs/schema.sql, « lot 2.5 »).
-- RLS : la personne destinataire (owner_access) et le worker (system_access : les consommateurs d'événements écrivent
-- en espace system). Aucune politique d'association : un gestionnaire ne lit jamais la cloche d'une autre personne.
-- deliveries reste vide en V1 (aucun canal externe avant les lots 4.2 et 6.x).

CREATE TYPE delivery_channel AS ENUM ('push', 'email', 'sms');
--> statement-breakpoint
CREATE TYPE deliveries_status AS ENUM ('queued', 'sent', 'delivered', 'failed', 'bounced');
--> statement-breakpoint
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  association_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text UNIQUE
);
--> statement-breakpoint
COMMENT ON TABLE notifications IS 'Notification in-app, affichée dans la cloche.';
--> statement-breakpoint
COMMENT ON COLUMN notifications.type IS 'payment.validated, contract.signature_required…';
--> statement-breakpoint
COMMENT ON COLUMN notifications.title IS 'rendus au moment de la création';
--> statement-breakpoint
COMMENT ON COLUMN notifications.body IS 'rendus au moment de la création';
--> statement-breakpoint
COMMENT ON COLUMN notifications.action_url IS 'route front cible, ex. /paiements/declarer?projet=…';
--> statement-breakpoint
COMMENT ON COLUMN notifications.dedupe_key IS 'empêche les doublons';
--> statement-breakpoint
CREATE TABLE deliveries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  association_id uuid,
  notification_id uuid,
  channel delivery_channel NOT NULL,
  provider text NOT NULL,
  provider_message_id text,
  recipient_masked text NOT NULL,
  status deliveries_status NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  cost_units int,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz
);
--> statement-breakpoint
COMMENT ON TABLE deliveries IS 'Chaque envoi réel sur un canal externe.';
--> statement-breakpoint
COMMENT ON COLUMN deliveries.channel IS 'push · email · sms';
--> statement-breakpoint
COMMENT ON COLUMN deliveries.provider IS 'webpush pour le push standard ; nom de l''adaptateur pour le groupe 6';
--> statement-breakpoint
COMMENT ON COLUMN deliveries.provider_message_id IS 'webpush pour le push standard ; nom de l''adaptateur pour le groupe 6';
--> statement-breakpoint
COMMENT ON COLUMN deliveries.recipient_masked IS '+225 07 •• •• •• 11';
--> statement-breakpoint
COMMENT ON COLUMN deliveries.status IS 'queued · sent · delivered · failed · bounced';
--> statement-breakpoint
COMMENT ON COLUMN deliveries.cost_units IS 'coût éventuel (SMS du groupe 6)';
--> statement-breakpoint
ALTER TABLE notifications ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE notifications ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE deliveries ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
-- Cloche : non-lus d'une personne, du plus récent au plus ancien.
CREATE INDEX notifications_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
--> statement-breakpoint
-- RLS (architecture/02).
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_access ON notifications
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY system_access ON notifications
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
--> statement-breakpoint
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE deliveries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_access ON deliveries
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY system_access ON deliveries
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
