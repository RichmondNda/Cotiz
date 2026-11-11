-- Lot 4.2 · étape 1 : préférences de notification, modèles de messages et abonnements Web Push
-- (docs/specs/schema.sql, « lot 4.2 »). RLS à l'identique du schéma cible :
-- - notification_preferences, push_subscriptions : tables personnelles (owner_access) + worker (system_access) ;
-- - message_templates : modèles de la plateforme (association_id NULL) lisibles par tous, modèles d'une association
--   lus et écrits dans son seul contexte. Les modèles de la plateforme s'écrivent par cotiz_platform (BYPASSRLS).

CREATE TYPE notification_channel AS ENUM ('in_app', 'push', 'email', 'sms');
--> statement-breakpoint
CREATE TYPE template_channel AS ENUM ('in_app', 'push', 'email', 'sms', 'manual');
--> statement-breakpoint
CREATE TABLE notification_preferences (
  user_id uuid NOT NULL,
  type text NOT NULL,
  channel notification_channel NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, type, channel)
);
--> statement-breakpoint
COMMENT ON TABLE notification_preferences IS 'Choix de canal par type et par utilisateur.';
--> statement-breakpoint
COMMENT ON COLUMN notification_preferences.channel IS 'in_app · push · email · sms';
--> statement-breakpoint
CREATE TABLE message_templates (
  id uuid PRIMARY KEY,
  association_id uuid,
  key text NOT NULL,
  channel template_channel NOT NULL,
  locale text NOT NULL DEFAULT 'fr-CI',
  subject text NOT NULL,
  body text NOT NULL,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
COMMENT ON TABLE message_templates IS 'Modèles de messages versionnés.';
--> statement-breakpoint
COMMENT ON COLUMN message_templates.association_id IS 'NULL = modèle plateforme';
--> statement-breakpoint
COMMENT ON COLUMN message_templates.channel IS 'in_app · push · email · sms · manual';
--> statement-breakpoint
COMMENT ON COLUMN message_templates.subject IS 'variables Handlebars';
--> statement-breakpoint
COMMENT ON COLUMN message_templates.body IS 'variables Handlebars';
--> statement-breakpoint
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  last_success_at timestamptz,
  failed_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
--> statement-breakpoint
COMMENT ON TABLE push_subscriptions IS 'Abonnements Web Push (protocole standard, clés VAPID propres, aucun compte chez un tiers).';
--> statement-breakpoint
COMMENT ON COLUMN push_subscriptions.failed_count IS 'désactivé après 5 échecs ou réponse 404/410';
--> statement-breakpoint
ALTER TABLE message_templates ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
-- RLS (architecture/02).
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_access ON notification_preferences
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY system_access ON notification_preferences
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
--> statement-breakpoint
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE message_templates FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_templates_read ON message_templates FOR SELECT
  USING (association_id IS NULL);
--> statement-breakpoint
CREATE POLICY tenant_templates ON message_templates
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_access ON push_subscriptions
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY system_access ON push_subscriptions
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
