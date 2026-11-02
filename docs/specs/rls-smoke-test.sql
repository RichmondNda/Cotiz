-- Test de fumée de l'isolation et des invariants — à exécuter sur une base vide
-- créée depuis schema.sql, en superutilisateur. Porté ensuite en tests Vitest + Testcontainers (lot 0.4).
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO users (id, phone_e164, first_name, last_name, status) VALUES
 ('00000000-0000-7000-8000-000000000001', '+2250708091011', 'Awa', 'Koné', 'active'),
 ('00000000-0000-7000-8000-000000000002', '+2250544218790', 'Moussa', 'Diarra', 'active'),
 ('00000000-0000-7000-8000-000000000003', '+2250122334455', 'Fatou', 'Traoré', 'active');
INSERT INTO associations (id, slug, name, type, city, country, contact_email, contact_phone, status) VALUES
 ('00000000-0000-7000-8000-00000000a001', 'entraide-yopougon', 'Entraide Yopougon', 'entraide', 'Abidjan', 'CI', 'contact@ey.ci', '+2250700000000', 'active'),
 ('00000000-0000-7000-8000-00000000a002', 'ressortissants-man', 'Ressortissants de Man', 'ressortissants', 'Abidjan', 'CI', 'contact@man.ci', '+2250700000001', 'active');
INSERT INTO memberships (id, association_id, user_id, role, status) VALUES
 ('00000000-0000-7000-8000-00000000b001', '00000000-0000-7000-8000-00000000a001', '00000000-0000-7000-8000-000000000001', 'owner', 'active'),
 ('00000000-0000-7000-8000-00000000b002', '00000000-0000-7000-8000-00000000a001', '00000000-0000-7000-8000-000000000002', 'subscriber', 'active'),
 ('00000000-0000-7000-8000-00000000b003', '00000000-0000-7000-8000-00000000a002', '00000000-0000-7000-8000-000000000003', 'subscriber', 'active');
INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency, due_day, schedule_type, start_date, created_by) VALUES
 ('00000000-0000-7000-8000-00000000c001', '00000000-0000-7000-8000-00000000a001', 'Centre communautaire', '', 'active', 25000, 'monthly', 5, 'fixed', '2026-03-01', '00000000-0000-7000-8000-000000000001'),
 ('00000000-0000-7000-8000-00000000c002', '00000000-0000-7000-8000-00000000a002', 'Projet Man', '', 'active', 10000, 'monthly', 5, 'fixed', '2026-03-01', '00000000-0000-7000-8000-000000000001');
INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at, activated_at, withdrawn_at, withdrawn_by, withdraw_reason) VALUES
 ('00000000-0000-7000-8000-00000000e001', '00000000-0000-7000-8000-00000000a001', '00000000-0000-7000-8000-00000000c001', '00000000-0000-7000-8000-000000000002', 'active', '2026-03-01', now(), now(), now(), '00000000-0000-7000-8000-000000000001', ''),
 ('00000000-0000-7000-8000-00000000e002', '00000000-0000-7000-8000-00000000a002', '00000000-0000-7000-8000-00000000c002', '00000000-0000-7000-8000-000000000003', 'active', '2026-03-01', now(), now(), now(), '00000000-0000-7000-8000-000000000001', '');
INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date, amount_due) VALUES
 ('00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000a001', '00000000-0000-7000-8000-00000000c001', '00000000-0000-7000-8000-00000000e001', '00000000-0000-7000-8000-000000000002', 'periodic', 1, '2026-03-05', 25000),
 ('00000000-0000-7000-8000-00000000d002', '00000000-0000-7000-8000-00000000a001', '00000000-0000-7000-8000-00000000c001', '00000000-0000-7000-8000-00000000e001', '00000000-0000-7000-8000-000000000002', 'periodic', 2, '2026-04-05', 25000),
 ('00000000-0000-7000-8000-00000000d003', '00000000-0000-7000-8000-00000000a002', '00000000-0000-7000-8000-00000000c002', '00000000-0000-7000-8000-00000000e002', '00000000-0000-7000-8000-000000000003', 'periodic', 1, '2026-03-05', 10000);
COMMIT;

-- 1. Gestionnaire d'Entraide Yopougon : ne voit que son association
BEGIN; SET LOCAL ROLE cotiz_app;
SET LOCAL app.association_id = '00000000-0000-7000-8000-00000000a001'; SET LOCAL app.user_id = '00000000-0000-7000-8000-000000000001'; SET LOCAL app.space = 'association';
DO $$ BEGIN
  IF (SELECT count(*) FROM installments) <> 2 THEN RAISE EXCEPTION 'ÉCHEC 1a : fuite ou manque sur installments'; END IF;
  IF (SELECT count(*) FROM projects) <> 1 THEN RAISE EXCEPTION 'ÉCHEC 1b : fuite sur projects'; END IF;
  IF (SELECT count(*) FROM associations) <> 1 THEN RAISE EXCEPTION 'ÉCHEC 1c : fuite sur associations'; END IF;
END $$;
-- écrire dans une autre association doit échouer
DO $$ BEGIN
  BEGIN
    INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency, due_day, schedule_type, start_date, created_by)
    VALUES ('00000000-0000-7000-8000-00000000c999', '00000000-0000-7000-8000-00000000a002', 'intrus', '', 'draft', 1, 'monthly', 5, 'fixed', '2026-01-01', '00000000-0000-7000-8000-000000000001');
    RAISE EXCEPTION 'ÉCHEC 1d : écriture inter-association acceptée';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

-- 2. Sans contexte : zéro ligne, jamais d'erreur silencieuse ni de fuite
BEGIN; SET LOCAL ROLE cotiz_app;
DO $$ BEGIN IF (SELECT count(*) FROM installments) <> 0 THEN RAISE EXCEPTION 'ÉCHEC 2 : lignes visibles sans contexte'; END IF; END $$;
ROLLBACK;

-- 3. Souscripteur Moussa : ses échéances seulement, et le projet auquel il est inscrit
BEGIN; SET LOCAL ROLE cotiz_app;
SET LOCAL app.user_id = '00000000-0000-7000-8000-000000000002'; SET LOCAL app.space = 'subscriber';
DO $$ BEGIN
  IF (SELECT count(*) FROM installments) <> 2 THEN RAISE EXCEPTION 'ÉCHEC 3a'; END IF;
  IF (SELECT count(*) FROM projects) <> 1 THEN RAISE EXCEPTION 'ÉCHEC 3b'; END IF;
  IF (SELECT count(*) FROM associations) <> 1 THEN RAISE EXCEPTION 'ÉCHEC 3c'; END IF;
END $$;
ROLLBACK;

-- 4. Invariant : un paiement validé dont les allocations ne font pas le compte est refusé au COMMIT
BEGIN;
INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared, paid_on, transaction_reference, status, idempotency_key)
VALUES ('00000000-0000-7000-8000-0000000fa001', '00000000-0000-7000-8000-00000000a001', '00000000-0000-7000-8000-00000000c001', '00000000-0000-7000-8000-00000000e001', '00000000-0000-7000-8000-000000000002', 50000, '2026-04-06', 'OM-123', 'pending', 'k1');
INSERT INTO allocations (id, association_id, payment_id, installment_id, enrollment_id, amount, state) VALUES
 ('00000000-0000-7000-8000-0000000ab001', '00000000-0000-7000-8000-00000000a001', '00000000-0000-7000-8000-0000000fa001', '00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000e001', 25000, 'confirmed');
UPDATE payments SET status = 'validated', reviewed_by = '00000000-0000-7000-8000-000000000001', reviewed_at = now() WHERE id = '00000000-0000-7000-8000-0000000fa001';
DO $$ BEGIN
  BEGIN SET CONSTRAINTS payments_allocations_sum IMMEDIATE; RAISE EXCEPTION 'ÉCHEC 4 : somme incorrecte acceptée';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'allocation_mismatch' THEN RAISE; END IF; END;
END $$;
ROLLBACK;

-- 5. Invariant : pas de sur-engagement d'une échéance
DO $$ BEGIN
  BEGIN UPDATE installments SET amount_paid = 20000, amount_pending = 10000 WHERE id = '00000000-0000-7000-8000-00000000d001';
    RAISE EXCEPTION 'ÉCHEC 5';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- 6. Journal d'audit en ajout seul
INSERT INTO audit_logs (occurred_at, actor_user_id, actor_role, action, entity_type, entity_id, before, after, request_id, ip, user_agent)
VALUES (now(), '00000000-0000-7000-8000-000000000001', 'owner', 'test', 'x', '00000000-0000-7000-8000-000000000001', '{}', '{}', 'r', '127.0.0.1', 'psql');
DO $$ BEGIN
  BEGIN DELETE FROM audit_logs; RAISE EXCEPTION 'ÉCHEC 6';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'append_only' THEN RAISE; END IF; END;
END $$;

SELECT 'OK : isolation et invariants vérifiés' AS resultat;
