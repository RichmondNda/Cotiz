-- Lot 0.5 · étape 2 : TRUNCATE ignore la RLS et les déclencheurs de ligne ; le journal d'audit le refuse aussi au
-- propriétaire et au superutilisateur (docs/specs/schema.sql). contract_signatures : au lot 4.1, avec la table.
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
