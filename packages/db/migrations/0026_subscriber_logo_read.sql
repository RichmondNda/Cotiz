-- Retours d'interface du 2026-11-12 : le souscripteur voit le logo des associations dont il est membre actif
-- (docs/specs/schema.sql, politique subscriber_logo_read). Lecture seule, et seulement le logo en cours
-- (associations.logo_file_id) : ni un ancien logo, ni un autre fichier de l'association.
CREATE POLICY subscriber_logo_read ON files FOR SELECT
  USING (app_space() = 'subscriber' AND purpose = 'logo'
         AND EXISTS (SELECT 1 FROM associations a JOIN memberships m ON m.association_id = a.id
                      WHERE a.id = files.association_id AND a.logo_file_id = files.id
                        AND m.user_id = app_user_id() AND m.status = 'active'));
