-- Lot 2.3 · étape 1 : tables subscriber_profiles, enrollments (module members) et installments (module ledger)
-- (docs/specs/schema.sql, « lot 2.3 »).
-- RLS : l'association (tenant_isolation), le souscripteur sur ses propres lignes et dans son espace seulement
-- (subscriber_self_read, subscriber_sign_update, subscriber_pending_update), le worker (system_access : cycle roulant,
-- retards). subscriber_profiles est globale, sans RLS (comme users), accès limité au module members.
-- Clés composites (schema.sql modifié avec accord, choix Q9) : la RLS ne contrôle que association_id ; une inscription
-- pointe vers un projet de son association, une échéance reprend l'association, le projet et la personne de son
-- inscription (user_id dénormalisé, lu par la RLS souscripteur). UNIQUE (enrollment_id, kind, sequence) : une case par
-- rang, extension du cycle roulant idempotente.
-- Pose aussi les lectures souscripteur des projets reportées au lot 2.2 (subscriber_enrolled_read, choix Q5 du lot 2.2).

CREATE TYPE enrollments_status AS ENUM ('pending_signature', 'active', 'withdrawn', 'completed');
--> statement-breakpoint
CREATE TYPE installments_kind AS ENUM ('entry_fee', 'periodic');
--> statement-breakpoint
CREATE TYPE installments_status AS ENUM ('upcoming', 'due', 'declared', 'partial', 'paid', 'late', 'waived', 'canceled');
--> statement-breakpoint
CREATE TABLE subscriber_profiles (
  user_id uuid PRIMARY KEY,
  address text,
  city text,
  created_by_association_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
COMMENT ON TABLE subscriber_profiles IS 'Informations complémentaires d''une personne en tant que souscripteur. Globales, pas propres à une association.';
--> statement-breakpoint
COMMENT ON COLUMN subscriber_profiles.created_by_association_id IS 'association qui a créé le compte, pour traçabilité';
--> statement-breakpoint
CREATE TABLE enrollments (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status enrollments_status NOT NULL DEFAULT 'pending_signature',
  starts_from date NOT NULL,
  joined_at timestamptz NOT NULL,
  activated_at timestamptz,
  withdrawn_at timestamptz,
  withdrawn_by uuid,
  withdraw_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id),
  UNIQUE (id, association_id, project_id, user_id)
);
--> statement-breakpoint
COMMENT ON TABLE enrollments IS 'Participation d''une personne à un projet.';
--> statement-breakpoint
COMMENT ON COLUMN enrollments.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN enrollments.status IS 'pending_signature · active · withdrawn · completed';
--> statement-breakpoint
COMMENT ON COLUMN enrollments.starts_from IS 'permet l''entrée en cours de projet';
--> statement-breakpoint
CREATE TABLE installments (
  id uuid PRIMARY KEY,
  association_id uuid NOT NULL,
  project_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind installments_kind NOT NULL,
  sequence int NOT NULL,
  due_date date NOT NULL,
  amount_due bigint NOT NULL,
  amount_paid bigint NOT NULL DEFAULT 0,
  amount_pending bigint NOT NULL DEFAULT 0,
  status installments_status NOT NULL DEFAULT 'upcoming',
  late_since date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount_paid <= amount_due),
  UNIQUE (enrollment_id, kind, sequence)
);
--> statement-breakpoint
COMMENT ON TABLE installments IS 'Échéance attendue (fonds d''entrée ou cotisation périodique). Une ligne = une case de la grille.';
--> statement-breakpoint
COMMENT ON COLUMN installments.association_id IS 'RLS';
--> statement-breakpoint
COMMENT ON COLUMN installments.user_id IS 'user_id dénormalisé pour l''espace souscripteur';
--> statement-breakpoint
COMMENT ON COLUMN installments.kind IS 'entry_fee · periodic';
--> statement-breakpoint
COMMENT ON COLUMN installments.sequence IS '0 = entrée, puis 1, 2…';
--> statement-breakpoint
COMMENT ON COLUMN installments.due_date IS 'dans le fuseau de l''association';
--> statement-breakpoint
COMMENT ON COLUMN installments.amount_paid IS 'somme des répartitions validées — maintenue en transaction';
--> statement-breakpoint
COMMENT ON COLUMN installments.amount_pending IS 'somme des répartitions déclarées non encore validées';
--> statement-breakpoint
COMMENT ON COLUMN installments.status IS 'upcoming · due · declared · partial · paid · late · waived · canceled';
--> statement-breakpoint
ALTER TABLE subscriber_profiles ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE enrollments ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE enrollments ADD FOREIGN KEY (project_id, association_id) REFERENCES projects(id, association_id);
--> statement-breakpoint
ALTER TABLE enrollments ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE enrollments ADD FOREIGN KEY (withdrawn_by) REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE installments ADD FOREIGN KEY (association_id) REFERENCES associations(id);
--> statement-breakpoint
ALTER TABLE installments ADD FOREIGN KEY (project_id) REFERENCES projects(id);
--> statement-breakpoint
ALTER TABLE installments ADD FOREIGN KEY (enrollment_id, association_id, project_id, user_id)
  REFERENCES enrollments(id, association_id, project_id, user_id);
--> statement-breakpoint
ALTER TABLE installments ADD FOREIGN KEY (user_id) REFERENCES users(id);
--> statement-breakpoint
-- Invariants des montants (schema.sql § 4).
ALTER TABLE installments ADD CONSTRAINT installments_no_overcommit CHECK (amount_paid + amount_pending <= amount_due);
--> statement-breakpoint
ALTER TABLE installments ADD CONSTRAINT installments_non_negative CHECK (amount_paid >= 0 AND amount_pending >= 0 AND amount_due > 0);
--> statement-breakpoint
-- Fonds d'entrée au rang 0, cotisations à partir de 1 (domain-rules § 2, règles 2 et 4).
ALTER TABLE installments ADD CONSTRAINT installments_kind_sequence CHECK ((kind = 'entry_fee' AND sequence = 0) OR (kind = 'periodic' AND sequence >= 1));
--> statement-breakpoint
-- 6. Inscriptions et échéances (lot 2.3) : association, projet, inscription et personne ne changent jamais (une ligne
--    ne passe pas d'un projet ou d'une association à l'autre, même là où une clé composite l'accepterait). Dans
--    l'espace subscriber, seulement la signature d'une inscription (pending_signature → active, lot 4.1) et la
--    déclaration sur une échéance (amount_pending, status, lot 3.3) : jamais les montants dus ou versés.
CREATE FUNCTION guard_enrollment_update() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF NEW.id <> OLD.id OR NEW.association_id <> OLD.association_id OR NEW.project_id <> OLD.project_id
     OR NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'forbidden_update' USING ERRCODE = 'P0001';
  END IF;
  IF app_space() = 'subscriber' AND (
       (to_jsonb(NEW) - 'status' - 'activated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'activated_at')
       OR (NEW.status <> OLD.status AND NOT (OLD.status = 'pending_signature' AND NEW.status = 'active'))) THEN
    RAISE EXCEPTION 'forbidden_update' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER enrollments_guard BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION guard_enrollment_update();
--> statement-breakpoint
CREATE FUNCTION guard_installment_update() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF NEW.id <> OLD.id OR NEW.association_id <> OLD.association_id OR NEW.project_id <> OLD.project_id
     OR NEW.enrollment_id <> OLD.enrollment_id OR NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'forbidden_update' USING ERRCODE = 'P0001';
  END IF;
  IF app_space() = 'subscriber'
     AND (to_jsonb(NEW) - 'amount_pending' - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'amount_pending' - 'status') THEN
    RAISE EXCEPTION 'forbidden_update' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER installments_guard BEFORE UPDATE ON installments FOR EACH ROW EXECUTE FUNCTION guard_installment_update();
--> statement-breakpoint
-- Index des requêtes chaudes (architecture/09).
CREATE INDEX installments_grid ON installments (association_id, project_id, due_date) INCLUDE (status, amount_due, amount_paid, amount_pending, user_id);
--> statement-breakpoint
CREATE INDEX installments_self ON installments (user_id, due_date);
--> statement-breakpoint
CREATE INDEX installments_open_due ON installments (due_date) WHERE status IN ('upcoming', 'due', 'partial');
--> statement-breakpoint
CREATE INDEX enrollments_project ON enrollments (association_id, project_id, status);
--> statement-breakpoint
CREATE INDEX enrollments_user ON enrollments (user_id);
--> statement-breakpoint
-- Données financières : une échéance ne se supprime jamais (annulation = statut canceled).
REVOKE DELETE ON installments FROM cotiz_app, cotiz_platform;
--> statement-breakpoint
-- RLS (architecture/02).
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON enrollments
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY subscriber_self_read ON enrollments FOR SELECT
  USING (user_id = app_user_id() AND app_space() = 'subscriber');
--> statement-breakpoint
CREATE POLICY subscriber_sign_update ON enrollments FOR UPDATE
  USING (user_id = app_user_id() AND app_space() = 'subscriber')
  WITH CHECK (user_id = app_user_id() AND app_space() = 'subscriber');
--> statement-breakpoint
CREATE POLICY system_access ON enrollments
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
--> statement-breakpoint
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE installments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON installments
  USING (association_id = app_association_id())
  WITH CHECK (association_id = app_association_id());
--> statement-breakpoint
CREATE POLICY subscriber_self_read ON installments FOR SELECT
  USING (user_id = app_user_id() AND app_space() = 'subscriber');
--> statement-breakpoint
CREATE POLICY subscriber_pending_update ON installments FOR UPDATE
  USING (user_id = app_user_id() AND app_space() = 'subscriber')
  WITH CHECK (user_id = app_user_id() AND app_space() = 'subscriber');
--> statement-breakpoint
CREATE POLICY system_access ON installments
  USING (app_space() = 'system')
  WITH CHECK (app_space() = 'system');
--> statement-breakpoint
-- Lectures souscripteur des projets suivis (reportées au lot 2.2).
CREATE POLICY subscriber_enrolled_read ON projects FOR SELECT
  USING (app_space() = 'subscriber' AND EXISTS (SELECT 1 FROM enrollments e WHERE e.project_id = projects.id AND e.user_id = app_user_id()));
--> statement-breakpoint
CREATE POLICY subscriber_enrolled_read ON project_payment_methods FOR SELECT
  USING (app_space() = 'subscriber' AND EXISTS (SELECT 1 FROM enrollments e WHERE e.project_id = project_payment_methods.project_id AND e.user_id = app_user_id()));
