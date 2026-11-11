-- Accord de l'utilisateur (2026-11-10, PR « migrations 0018-0019 ») : la politique de 0015 laissait lire un contrat à
-- tout souscripteur ayant une inscription sur le projet, retirée comprise, sans appartenance active, et même en
-- brouillon. Le souscripteur lit désormais :
-- - un contrat qu'il a signé, quel que soit le statut de son inscription ou de son appartenance (historique gardé) ;
-- - sinon, un contrat verrouillé d'un projet où il a une inscription non retirée et une appartenance souscripteur
--   active dans l'association (pour le signer).
-- Politique reportée dans docs/specs/schema.sql.
DROP POLICY subscriber_enrolled_read ON contracts;
--> statement-breakpoint
CREATE POLICY subscriber_enrolled_read ON contracts FOR SELECT
  USING (app_space() = 'subscriber' AND (
    EXISTS (SELECT 1 FROM contract_signatures s WHERE s.contract_id = contracts.id AND s.user_id = app_user_id())
    OR (contracts.locked_at IS NOT NULL AND EXISTS (
      SELECT 1 FROM enrollments e
      JOIN memberships m ON m.association_id = e.association_id AND m.user_id = e.user_id
      WHERE e.project_id = contracts.project_id AND e.association_id = contracts.association_id
        AND e.user_id = app_user_id() AND e.status <> 'withdrawn'
        AND m.role = 'subscriber' AND m.status = 'active'))));
