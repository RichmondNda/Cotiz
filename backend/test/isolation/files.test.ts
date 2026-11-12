import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  A,
  asManagerOf,
  asSubscriber,
  B,
  errorOf,
  type IsolationHarness,
  isRlsViolation,
  seedAssociations,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Isolation de `files` (base migrée) : tenant_isolation (gestionnaires de l'association), owner_access (le déposant,
 * dans l'espace souscripteur seulement : sa preuve, avant et après rattachement), system_access (worker). Chaque
 * politique est aussi testée affaiblie. subscriber_logo_read (retours d'interface du 2026-11-12) : le logo en cours
 * d'une association, pour ses membres actifs en espace souscripteur, et rien d'autre.
 */

const FILES = {
  logoA: '00000000-0000-7000-8000-0000000f0a01',
  logoB: '00000000-0000-7000-8000-0000000f0b01',
  proofMoussa: '00000000-0000-7000-8000-0000000f0c01',
  proofFatou: '00000000-0000-7000-8000-0000000f0c02',
  /** Preuve de Moussa rattachée à A (déclaration de paiement, lot 3.3) : déposée par un autre que le gestionnaire. */
  proofMoussaA: '00000000-0000-7000-8000-0000000f0c03',
  /** Ancien logo de A, remplacé : jamais lisible par un souscripteur. */
  oldLogoA: '00000000-0000-7000-8000-0000000f0a02',
} as const;

const visible = (tx: Tx) =>
  tx.execute<{ id: string }>(sql`SELECT id FROM files ORDER BY id`).then((r) => r.rows.map((row) => row.id));

const insertFile = (tx: Tx, id: string, associationId: string | null, ownerUserId: string) =>
  tx.execute(sql`INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name,
                                    mime_type, size_bytes)
                 VALUES (${id}, ${associationId}, ${ownerUserId}, 'logo', 'cotiz-media', ${`quarantine/${id}`}, 'x.png',
                         'image/png', 10)`);

describe('isolation : files (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                          size_bytes)
       VALUES ($1, $5, $7, 'logo', 'cotiz-media', 'k1', 'a.png', 'image/png', 10),
              ($2, $6, $8, 'logo', 'cotiz-media', 'k2', 'b.png', 'image/png', 10),
              ($3, NULL, $9, 'payment_proof', 'cotiz-proofs', 'k3', 'm.pdf', 'application/pdf', 10),
              ($4, NULL, $10, 'payment_proof', 'cotiz-proofs', 'k4', 'f.pdf', 'application/pdf', 10),
              ($11, $5, $9, 'payment_proof', 'cotiz-proofs', 'k5', 'm2.pdf', 'application/pdf', 10)`,
      [
        FILES.logoA,
        FILES.logoB,
        FILES.proofMoussa,
        FILES.proofFatou,
        A.id,
        B.id,
        USERS.awa,
        USERS.koffi,
        USERS.moussa,
        USERS.fatou,
        FILES.proofMoussaA,
      ],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  it('chaque gestionnaire voit tous les fichiers de son association, quel qu’en soit le déposant, et seulement eux', async () => {
    expect(await h.as(asManagerOf(A), visible)).toEqual([FILES.logoA, FILES.proofMoussaA]);
    expect(await h.as(asManagerOf(B), visible)).toEqual([FILES.logoB]);
  });

  it('chaque souscripteur ne voit que ses propres fichiers, rattachés ou non', async () => {
    expect(await h.as(asSubscriber(USERS.moussa), visible)).toEqual([FILES.proofMoussa, FILES.proofMoussaA]);
    expect(await h.as(asSubscriber(USERS.fatou), visible)).toEqual([FILES.proofFatou]);
  });

  it('un gestionnaire, hors de l’espace association, ne voit plus les fichiers qu’il a déposés pour elle', async () => {
    expect(await h.as(asSubscriber(USERS.awa), visible)).toEqual([]);
    expect(await h.as({ space: 'platform', userId: USERS.awa }, visible)).toEqual([]);
    // Awa dans le contexte de B (où elle est souscriptrice) : rien de A.
    expect(await h.as({ space: 'association', associationId: B.id, userId: USERS.awa }, visible)).toEqual([
      FILES.logoB,
    ]);
  });

  it('sans contexte, ou en espace public : aucun fichier', async () => {
    expect(await h.withoutContext(visible)).toEqual([]);
    expect(await h.countWithoutTenantDatabase('files')).toBe(0);
    expect(await h.as({ space: 'public' }, visible)).toEqual([]);
  });

  it('un gestionnaire de A ne peut pas créer un fichier de B au nom d’un autre', async () => {
    const error = await errorOf(
      h.asRollback(asManagerOf(A), (tx) => insertFile(tx, '00000000-0000-7000-8000-0000000f0d01', B.id, USERS.koffi)),
    );
    expect(isRlsViolation(error)).toBe(true);
  });

  it('un gestionnaire de A ne peut pas créer un fichier de B, même à son propre nom', async () => {
    const error = await errorOf(
      h.asRollback(asManagerOf(A), (tx) => insertFile(tx, '00000000-0000-7000-8000-0000000f0d03', B.id, USERS.awa)),
    );
    expect(isRlsViolation(error)).toBe(true);
  });

  it('un souscripteur ne rattache pas lui-même un fichier à une association', async () => {
    const created = await errorOf(
      h.asRollback(asSubscriber(USERS.moussa), (tx) =>
        insertFile(tx, '00000000-0000-7000-8000-0000000f0d04', B.id, USERS.moussa),
      ),
    );
    expect(isRlsViolation(created)).toBe(true);
    const moved = await errorOf(
      h.asRollback(asSubscriber(USERS.moussa), (tx) =>
        tx.execute(sql`UPDATE files SET association_id = ${B.id} WHERE id = ${FILES.proofMoussa}`),
      ),
    );
    expect(isRlsViolation(moved)).toBe(true);
  });

  it('un souscripteur ne peut pas créer un fichier au nom d’un autre', async () => {
    const error = await errorOf(
      h.asRollback(asSubscriber(USERS.moussa), (tx) =>
        insertFile(tx, '00000000-0000-7000-8000-0000000f0d02', null, USERS.fatou),
      ),
    );
    expect(isRlsViolation(error)).toBe(true);
  });

  it('un gestionnaire ne modifie pas le fichier d’une autre association', async () => {
    const updated = await h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`UPDATE files SET scan_status = 'clean', sha256 = repeat('a', 64) WHERE id = ${FILES.logoB}`),
    );
    expect(updated.rowCount).toBe(0);
  });

  it('le test échoue si tenant_isolation s’élargit', async () => {
    const leaked = await h.withPolicy('files', 'tenant_isolation', { using: 'true', withCheck: 'true' }, () =>
      h.as(asManagerOf(A), visible),
    );
    expect(leaked).toHaveLength(5);
  });

  it('le test échoue si owner_access ne dépend plus du déposant', async () => {
    const leaked = await h.withPolicy(
      'files',
      'owner_access',
      { using: 'owner_user_id IS NOT NULL', withCheck: 'owner_user_id IS NOT NULL' },
      () => h.as(asSubscriber(USERS.moussa), visible),
    );
    expect(leaked).toHaveLength(5);
  });

  it('le test échoue si owner_access ne dépend plus de l’espace souscripteur', async () => {
    const leaked = await h.withPolicy(
      'files',
      'owner_access',
      { using: 'owner_user_id = app_user_id()', withCheck: 'owner_user_id = app_user_id()' },
      () => h.as(asSubscriber(USERS.awa), visible),
    );
    expect(leaked).toEqual([FILES.logoA]);
  });

  it('le test échoue si system_access s’ouvre hors de l’espace system', async () => {
    const leaked = await h.withPolicy(
      'files',
      'system_access',
      { using: "app_space() <> 'none'", withCheck: "app_space() <> 'none'" },
      () => h.as(asSubscriber(USERS.fatou), visible),
    );
    expect(leaked).toHaveLength(5);
  });
  describe('subscriber_logo_read : le logo en cours, pour les membres actifs', () => {
    beforeAll(async () => {
      await h.superuser(
        `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                            size_bytes)
         VALUES ($1, $2, $3, 'logo', 'cotiz-media', 'k6', 'ancien.png', 'image/png', 10)`,
        [FILES.oldLogoA, A.id, USERS.awa],
      );
      await h.superuser(`UPDATE associations SET logo_file_id = $2 WHERE id = $1`, [A.id, FILES.logoA]);
      await h.superuser(`UPDATE associations SET logo_file_id = $2 WHERE id = $1`, [B.id, FILES.logoB]);
      // Moussa membre actif de A ; Fatou retirée de B.
      await h.superuser(
        `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at, removed_at)
         VALUES (gen_random_uuid(), $1, $3, 'subscriber', 'active', now(), NULL),
                (gen_random_uuid(), $2, $4, 'subscriber', 'removed', now(), now())`,
        [A.id, B.id, USERS.moussa, USERS.fatou],
      );
    });

    afterAll(async () => {
      await h.superuser(`DELETE FROM memberships WHERE user_id IN ($1, $2) AND role = 'subscriber'`, [
        USERS.moussa,
        USERS.fatou,
      ]);
      await h.superuser(`UPDATE associations SET logo_file_id = NULL WHERE id IN ($1, $2)`, [A.id, B.id]);
      await h.superuser(`DELETE FROM files WHERE id = $1`, [FILES.oldLogoA]);
    });

    it('un membre actif voit le logo en cours de son association, en plus de ses fichiers ; rien d’autre', async () => {
      expect(await h.as(asSubscriber(USERS.moussa), visible)).toEqual([
        FILES.logoA,
        FILES.proofMoussa,
        FILES.proofMoussaA,
      ]);
    });

    it('membre retiré : plus de logo ; hors espace souscripteur : rien', async () => {
      expect(await h.as(asSubscriber(USERS.fatou), visible)).toEqual([FILES.proofFatou]);
      expect(await h.as({ space: 'platform', userId: USERS.moussa }, visible)).toEqual([]);
      expect(await h.as({ space: 'public' }, visible)).toEqual([]);
    });

    it('lecture seule : un membre ne modifie pas le logo', async () => {
      const updated = await h.asRollback(asSubscriber(USERS.moussa), (tx) =>
        tx.execute(sql`UPDATE files SET original_name = 'autre.png' WHERE id = ${FILES.logoA}`),
      );
      expect(updated.rowCount).toBe(0);
    });

    it('le test échoue si subscriber_logo_read ne dépend plus de l’appartenance', async () => {
      const leaked = await h.withPolicy(
        'files',
        'subscriber_logo_read',
        { using: "app_space() = 'subscriber' AND purpose = 'logo'", withCheck: null },
        () => h.as(asSubscriber(USERS.fatou), visible),
      );
      expect(leaked).toContain(FILES.logoB);
    });

    it('le test échoue si subscriber_logo_read ne se limite plus au logo en cours', async () => {
      const leaked = await h.withPolicy(
        'files',
        'subscriber_logo_read',
        {
          using: `app_space() = 'subscriber' AND purpose = 'logo' AND EXISTS (SELECT 1 FROM memberships m
                   WHERE m.association_id = files.association_id AND m.user_id = app_user_id() AND m.status = 'active')`,
          withCheck: null,
        },
        () => h.as(asSubscriber(USERS.moussa), visible),
      );
      expect(leaked).toContain(FILES.oldLogoA);
    });
  });
});
