import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  A,
  asManagerOf,
  asSubscriber,
  B,
  errorOf,
  type IsolationHarness,
  isRlsViolation,
  pgCode,
  pgConstraint,
  pgMessage,
  seedAssociations,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Isolation des contrats et des signatures (lot 4.1, base migrée) : contracts (tenant_isolation,
 * subscriber_enrolled_read, clé composite du projet, déclencheur contracts_locked), contract_signatures
 * (tenant_isolation, subscriber_self_read, subscriber_sign lié à l'inscription, au contrat verrouillé et au PDF, une
 * signature par inscription, ajout seul : droits et déclencheurs forbid_mutation), files (subscriber_contract_pdf_read,
 * subscriber_contract_pdf_create). Chaque politique est aussi testée affaiblie. Dans subscriber_sign, les clauses
 * `owner_user_id` et `purpose` du PDF doublent la RLS de files (défense en profondeur : leur retrait seul ne fait
 * échouer aucun test).
 */

const PROJECTS = {
  a: '00000000-0000-7000-8000-00000000c411',
  /** Second projet de A : contrat en brouillon, Aminata y est inscrite. */
  a2: '00000000-0000-7000-8000-00000000c412',
  b: '00000000-0000-7000-8000-00000000c413',
  /** Troisième projet de A : contrat verrouillé, personne n'y est inscrit. */
  a3: '00000000-0000-7000-8000-00000000c415',
  /** Projet de B sans contrat. */
  b2: '00000000-0000-7000-8000-00000000c414',
} as const;

/** Moussa et Aminata au projet a de A ; Fatou et Moussa au projet b de B ; Aminata au projet a2. */
const ENROLLMENTS = {
  moussa: '00000000-0000-7000-8000-00000000e411',
  aminata: '00000000-0000-7000-8000-00000000e412',
  fatou: '00000000-0000-7000-8000-00000000e413',
  moussaB: '00000000-0000-7000-8000-00000000e414',
  aminataA2: '00000000-0000-7000-8000-00000000e415',
} as const;

const CONTRACTS = {
  /** Verrouillé. */
  a: '00000000-0000-7000-8000-0000000c0411',
  /** Brouillon. */
  a2: '00000000-0000-7000-8000-0000000c0412',
  /** Verrouillé. */
  b: '00000000-0000-7000-8000-0000000c0413',
  /** Verrouillé, sur le projet a3. */
  a3: '00000000-0000-7000-8000-0000000c0414',
} as const;

/** PDF de contrat (contract_pdf, en attente) : ceux des signatures, et des libres pour les essais d'insertion. */
const FILES = {
  moussa: '00000000-0000-7000-8000-0000000f1411',
  fatou: '00000000-0000-7000-8000-0000000f1412',
  /** Libre, à Aminata, dans A. */
  aminata: '00000000-0000-7000-8000-0000000f1413',
  /** Libre, à Moussa, dans A. */
  moussaSpare: '00000000-0000-7000-8000-0000000f1414',
  /** Libre, à Moussa, dans B. */
  moussaB: '00000000-0000-7000-8000-0000000f1415',
} as const;

const SIGNATURES = {
  moussa: '00000000-0000-7000-8000-0000000ae411',
  fatou: '00000000-0000-7000-8000-0000000ae412',
} as const;

const SHA = 'a'.repeat(64);

const ids = (table: 'contracts' | 'contract_signatures' | 'files') => (tx: Tx) =>
  tx
    .execute<{ id: string }>(sql`SELECT id FROM ${sql.identifier(table)} ORDER BY id`)
    .then((r) => r.rows.map((row) => row.id));
const contractIds = ids('contracts');
const signatureIds = ids('contract_signatures');
const fileIds = ids('files');

const insertContract = (tx: Tx, row: { id: string; association: string; project: string }) =>
  tx.execute(sql`INSERT INTO contracts (id, association_id, project_id, body_template, template_sha256,
                                        association_signer_name, association_signer_title)
                 VALUES (${row.id}, ${row.association}, ${row.project}, 'Modèle', ${SHA}, 'Awa Koné', 'Présidente')`);

interface SignatureRow {
  id: string;
  association: string;
  contract: string;
  enrollment: string;
  user: string;
  file: string;
}

const insertSignature = (tx: Tx, row: SignatureRow) =>
  tx.execute(sql`INSERT INTO contract_signatures (id, association_id, contract_id, enrollment_id, user_id,
                                                  rendered_sha256, rendered_body, consent_text, signed_at, ip,
                                                  user_agent, pdf_file_id)
                 VALUES (${row.id}, ${row.association}, ${row.contract}, ${row.enrollment}, ${row.user}, ${SHA}, 'Contrat',
                         'J’ai lu le contrat et je l’accepte.', now(), '10.0.0.1', 'test', ${row.file})`);

/** Signature valide d'Aminata dans A (inscription en attente, contrat verrouillé, son PDF), absente du jeu. */
const aminataSignature: SignatureRow = {
  id: '00000000-0000-7000-8000-0000000ae4f1',
  association: A.id,
  contract: CONTRACTS.a,
  enrollment: ENROLLMENTS.aminata,
  user: USERS.aminata,
  file: FILES.aminata,
};

const insertFile = (
  tx: Tx,
  row: {
    id: string;
    association: string | null;
    owner: string;
    purpose?: string;
    status?: string;
    sha256?: string;
    bucket?: string;
    key?: string;
    expires?: string;
  },
) =>
  tx.execute(sql`INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name,
                                    mime_type, size_bytes, scan_status, sha256, expires_at)
                 VALUES (${row.id}, ${row.association}, ${row.owner}, ${row.purpose ?? 'contract_pdf'}::files_purpose,
                         ${row.bucket ?? 'cotiz-legal'}, ${row.key ?? `${row.association ?? 'aucune'}/contract_pdf/${row.id}.pdf`}, 'contrat.pdf',
                         'application/pdf', 0,
                         ${row.status ?? 'pending'}::files_scan_status,
                         ${row.sha256 ?? (row.status === 'clean' ? SHA : null)},
                         ${row.expires ?? null}::timestamptz)`);

/** Connexion brute sous un rôle (cotiz_platform : BYPASSRLS), toujours annulée. */
async function asRole<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

/** Lecture en espace system (worker), en cotiz_app, toujours annulée. */
function asSystem(h: IsolationHarness, associationId: string | null, table: string): Promise<string[]> {
  return h.superuserRollback(async (client) => {
    await client.query(`SET LOCAL ROLE cotiz_app`);
    await client.query(`SELECT set_config('app.space', 'system', true)`);
    if (associationId) await client.query(`SELECT set_config('app.association_id', $1, true)`, [associationId]);
    const res = await client.query<{ id: string }>(`SELECT id FROM ${table} ORDER BY id`);
    return res.rows.map((r) => r.id);
  });
}

/** Contexte d'une route `/me` appelée avec un jeton association (gestionnaire) : la personne, sans association. */
const meAsManager = (userId: string) => ({ space: 'association', userId }) as const;

const PROJECT_INSERT = `INSERT INTO projects (id, association_id, name, description, status, installment_amount,
                                              frequency, due_day, schedule_type, start_date, end_date, created_by)
                        VALUES ($1, $2, $3, '', 'active', 25000, 'monthly', 5, 'fixed', '2026-03-01', '2027-08-31', $4)`;

describe('isolation : contracts et contract_signatures (base migrée)', () => {
  let h: IsolationHarness;

  /** Statut d'une inscription le temps de `fn` (préparation hors RLS). */
  async function withEnrollmentStatus<T>(enrollment: string, status: string, fn: () => Promise<T>): Promise<T> {
    await h.superuser(`UPDATE enrollments SET status = $2 WHERE id = $1`, [enrollment, status]);
    try {
      return await fn();
    } finally {
      await h.superuser(`UPDATE enrollments SET status = 'pending_signature' WHERE id = $1`, [enrollment]);
    }
  }

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(PROJECT_INSERT, [PROJECTS.a, A.id, 'Centre A', USERS.awa]);
    await h.superuser(PROJECT_INSERT, [PROJECTS.a2, A.id, 'Autre projet A', USERS.awa]);
    await h.superuser(PROJECT_INSERT, [PROJECTS.b, B.id, 'Projet B', USERS.koffi]);
    await h.superuser(PROJECT_INSERT, [PROJECTS.b2, B.id, 'Autre projet B', USERS.koffi]);
    await h.superuser(PROJECT_INSERT, [PROJECTS.a3, A.id, 'Troisième projet A', USERS.awa]);
    for (const [enrollment, association, project, user] of [
      [ENROLLMENTS.moussa, A.id, PROJECTS.a, USERS.moussa],
      [ENROLLMENTS.aminata, A.id, PROJECTS.a, USERS.aminata],
      [ENROLLMENTS.fatou, B.id, PROJECTS.b, USERS.fatou],
      [ENROLLMENTS.moussaB, B.id, PROJECTS.b, USERS.moussa],
      [ENROLLMENTS.aminataA2, A.id, PROJECTS.a2, USERS.aminata],
    ] as const) {
      await h.superuser(
        `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at)
         VALUES ($1, $2, $3, $4, 'pending_signature', '2026-03-01', now())`,
        [enrollment, association, project, user],
      );
    }
    for (const [file, association, owner] of [
      [FILES.moussa, A.id, USERS.moussa],
      [FILES.fatou, B.id, USERS.fatou],
      [FILES.aminata, A.id, USERS.aminata],
      [FILES.moussaSpare, A.id, USERS.moussa],
      [FILES.moussaB, B.id, USERS.moussa],
    ] as const) {
      await h.superuser(
        `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                            size_bytes)
         VALUES ($1::uuid, $2::uuid, $3, 'contract_pdf', 'cotiz-legal', $2::uuid || '/contract_pdf/' || $1::uuid || '.pdf',
                 'contrat.pdf', 'application/pdf', 0)`,
        [file, association, owner],
      );
    }
    await h.superuser(
      `INSERT INTO contracts (id, association_id, project_id, body_template, template_sha256, association_signer_name,
                              association_signer_title, association_signed_by, association_signed_at, locked_at)
       VALUES ($1, $4, $5, 'Modèle A', $8, 'Awa Koné', 'Présidente', $9, now(), now()),
              ($2, $4, $6, 'Brouillon A', $8, 'Awa Koné', 'Présidente', NULL, NULL, NULL),
              ($3, $7, $10, 'Modèle B', $8, 'Koffi Yao', 'Trésorier', $11, now(), now()),
              ($12, $4, $13, 'Modèle A3', $8, 'Awa Koné', 'Présidente', $9, now(), now())`,
      [
        CONTRACTS.a,
        CONTRACTS.a2,
        CONTRACTS.b,
        A.id,
        PROJECTS.a,
        PROJECTS.a2,
        B.id,
        SHA,
        USERS.awa,
        PROJECTS.b,
        USERS.koffi,
        CONTRACTS.a3,
        PROJECTS.a3,
      ],
    );
    await h.superuser(
      `INSERT INTO contract_signatures (id, association_id, contract_id, enrollment_id, user_id, rendered_sha256,
                                        rendered_body, consent_text, signed_at, pdf_file_id)
       VALUES ($1, $3, $4, $5, $6, $9, 'Contrat', 'J’accepte.', now(), $10),
              ($2, $7, $8, $11, $12, $9, 'Contrat', 'J’accepte.', now(), $13)`,
      [
        SIGNATURES.moussa,
        SIGNATURES.fatou,
        A.id,
        CONTRACTS.a,
        ENROLLMENTS.moussa,
        USERS.moussa,
        B.id,
        CONTRACTS.b,
        SHA,
        FILES.moussa,
        ENROLLMENTS.fatou,
        USERS.fatou,
        FILES.fatou,
      ],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('espace association', () => {
    it('chaque gestionnaire ne voit que les contrats et les signatures de son association', async () => {
      await h.as(asManagerOf(A), async (tx) => {
        expect(await contractIds(tx)).toEqual([CONTRACTS.a, CONTRACTS.a2, CONTRACTS.a3]);
        expect(await signatureIds(tx)).toEqual([SIGNATURES.moussa]);
      });
      await h.as(asManagerOf(B), async (tx) => {
        expect(await contractIds(tx)).toEqual([CONTRACTS.b]);
        expect(await signatureIds(tx)).toEqual([SIGNATURES.fatou]);
      });
    });

    it('un gestionnaire de A n’écrit ni contrat ni signature dans B', async () => {
      const contract = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          insertContract(tx, { id: '00000000-0000-7000-8000-0000000c04f1', association: B.id, project: PROJECTS.b }),
        ),
      );
      expect(isRlsViolation(contract)).toBe(true);
      const signature = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          insertSignature(tx, { ...aminataSignature, association: B.id, contract: CONTRACTS.b }),
        ),
      );
      expect(isRlsViolation(signature)).toBe(true);
    });

    it.each([
      ['à la place d’un souscripteur de A', aminataSignature],
      ['en citant l’inscription d’une autre association', { ...aminataSignature, enrollment: ENROLLMENTS.fatou }],
    ])('un gestionnaire de A ne crée aucune signature dans A, ni %s', async (_case, row) => {
      const error = await errorOf(h.asRollback(asManagerOf(A), (tx) => insertSignature(tx, row)));
      expect(isRlsViolation(error)).toBe(true);
    });

    it('dans son contexte, un gestionnaire ne pose pas de contrat sur le projet d’une autre association', async () => {
      // Clé composite (project_id, association_id) → projects : sinon un inscrit de B lirait le contrat de A.
      const error = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          insertContract(tx, { id: '00000000-0000-7000-8000-0000000c04f4', association: A.id, project: PROJECTS.b2 }),
        ),
      );
      expect(pgCode(error)).toBe('23503');
    });

    it('un gestionnaire de A ne modifie pas le contrat de B (aucune ligne visible)', async () => {
      const updated = await h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`UPDATE contracts SET body_template = 'Piraté' WHERE id = ${CONTRACTS.b}`),
      );
      expect(updated.rowCount).toBe(0);
    });

    it('un projet n’a qu’un contrat', async () => {
      const error = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          insertContract(tx, { id: '00000000-0000-7000-8000-0000000c04f2', association: A.id, project: PROJECTS.a }),
        ),
      );
      expect(pgCode(error)).toBe('23505');
    });

    it('route /me d’un gestionnaire (espace association sans association) : rien, et aucune signature', async () => {
      await h.as(meAsManager(USERS.moussa), async (tx) => {
        expect(await contractIds(tx)).toEqual([]);
        expect(await signatureIds(tx)).toEqual([]);
      });
      const error = await errorOf(
        h.asRollback(meAsManager(USERS.aminata), (tx) => insertSignature(tx, aminataSignature)),
      );
      expect(isRlsViolation(error)).toBe(true);
    });
  });

  describe('espace souscripteur', () => {
    it('le souscripteur lit le contrat des seuls projets où il est inscrit, dans chaque association', async () => {
      await h.as(asSubscriber(USERS.moussa), async (tx) => {
        expect(await contractIds(tx)).toEqual([CONTRACTS.a, CONTRACTS.b]);
      });
      await h.as(asSubscriber(USERS.fatou), async (tx) => {
        expect(await contractIds(tx)).toEqual([CONTRACTS.b]);
      });
      await h.as(asSubscriber(USERS.aminata), async (tx) => {
        expect(await contractIds(tx)).toEqual([CONTRACTS.a, CONTRACTS.a2]);
      });
    });

    it('inscription retirée : le contrat reste lisible', async () => {
      const seen = await withEnrollmentStatus(ENROLLMENTS.moussaB, 'withdrawn', () =>
        h.as(asSubscriber(USERS.moussa), contractIds),
      );
      expect(seen).toEqual([CONTRACTS.a, CONTRACTS.b]);
    });

    it('le souscripteur ne lit que ses propres signatures', async () => {
      await h.as(asSubscriber(USERS.moussa), async (tx) => {
        expect(await signatureIds(tx)).toEqual([SIGNATURES.moussa]);
      });
      await h.as(asSubscriber(USERS.aminata), async (tx) => {
        expect(await signatureIds(tx)).toEqual([]);
      });
    });

    it('le souscripteur signe son inscription en attente, puis relit sa signature', async () => {
      const seen = await h.asRollback(asSubscriber(USERS.aminata), async (tx) => {
        await insertSignature(tx, aminataSignature);
        return signatureIds(tx);
      });
      expect(seen).toEqual([aminataSignature.id]);
    });

    it('jamais pour une autre personne', async () => {
      const error = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) => insertSignature(tx, aminataSignature)),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it.each([
      ['l’inscription d’une autre personne', { enrollment: ENROLLMENTS.moussa }],
      ['le contrat d’une autre association', { contract: CONTRACTS.b }],
      ['une autre association', { association: B.id }],
      ['le contrat d’un autre projet (brouillon)', { contract: CONTRACTS.a2 }],
      ['le contrat verrouillé d’un autre projet de la même association', { contract: CONTRACTS.a3 }],
      ['le PDF d’une autre personne', { file: FILES.moussaSpare }],
    ] as const)('sa signature ne cite pas %s', async (_case, change) => {
      const error = await errorOf(
        h.asRollback(asSubscriber(USERS.aminata), (tx) => insertSignature(tx, { ...aminataSignature, ...change })),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('le PDF d’une autre association, même le sien', async () => {
      // Moussa signe son inscription de B avec son PDF de A : seule la clause d'association du PDF le refuse.
      const error = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) =>
          insertSignature(tx, {
            id: '00000000-0000-7000-8000-0000000ae4f3',
            association: B.id,
            contract: CONTRACTS.b,
            enrollment: ENROLLMENTS.moussaB,
            user: USERS.moussa,
            file: FILES.moussaSpare,
          }),
        ),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('un PDF déjà complété (clean) ne se rattache pas à une signature', async () => {
      await h.superuser(`UPDATE files SET scan_status = 'clean', sha256 = $2 WHERE id = $1`, [FILES.aminata, SHA]);
      try {
        const error = await errorOf(
          h.asRollback(asSubscriber(USERS.aminata), (tx) => insertSignature(tx, aminataSignature)),
        );
        expect(isRlsViolation(error)).toBe(true);
      } finally {
        await h.superuser(`UPDATE files SET scan_status = 'pending', sha256 = NULL WHERE id = $1`, [FILES.aminata]);
      }
    });

    it('pas de signature d’un contrat en brouillon, même pour sa propre inscription', async () => {
      const error = await errorOf(
        h.asRollback(asSubscriber(USERS.aminata), (tx) =>
          insertSignature(tx, { ...aminataSignature, contract: CONTRACTS.a2, enrollment: ENROLLMENTS.aminataA2 }),
        ),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it.each(['active', 'withdrawn', 'completed'])('pas de signature d’une inscription %s', async (status) => {
      const error = await withEnrollmentStatus(ENROLLMENTS.aminata, status, () =>
        errorOf(h.asRollback(asSubscriber(USERS.aminata), (tx) => insertSignature(tx, aminataSignature))),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it.each([
      [
        'la même inscription',
        ENROLLMENTS.moussa,
        USERS.moussa,
        FILES.moussaSpare,
        'contract_signatures_enrollment_id_key',
      ],
      ['le même PDF', ENROLLMENTS.aminata, USERS.aminata, FILES.moussa, 'contract_signatures_pdf_file_id_key'],
    ])('UNIQUE, même hors RLS : pas deux signatures citant %s', async (_case, enrollment, user, file, constraint) => {
      const error = await errorOf(
        h.superuserRollback((c) =>
          c.query(
            `INSERT INTO contract_signatures (id, association_id, contract_id, enrollment_id, user_id, rendered_sha256,
                                              rendered_body, consent_text, signed_at, pdf_file_id)
             VALUES ('00000000-0000-7000-8000-0000000ae4f4', $1, $2, $3, $4, $5, 'Contrat', 'J’accepte.', now(), $6)`,
            [A.id, CONTRACTS.a, enrollment, user, SHA, file],
          ),
        ),
      );
      expect({ code: pgCode(error), constraint: pgConstraint(error) }).toEqual({ code: '23505', constraint });
    });

    it('une seule signature par inscription', async () => {
      // Moussa a déjà signé : une seconde signature (autre PDF à lui) heurte UNIQUE (enrollment_id).
      const error = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) =>
          insertSignature(tx, {
            id: '00000000-0000-7000-8000-0000000ae4f2',
            association: A.id,
            contract: CONTRACTS.a,
            enrollment: ENROLLMENTS.moussa,
            user: USERS.moussa,
            file: FILES.moussaSpare,
          }),
        ),
      );
      expect(pgCode(error)).toBe('23505');
    });

    it('le souscripteur n’écrit aucun contrat', async () => {
      const insert = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) =>
          insertContract(tx, { id: '00000000-0000-7000-8000-0000000c04f3', association: A.id, project: PROJECTS.a2 }),
        ),
      );
      expect(isRlsViolation(insert)).toBe(true);
      const update = await h.asRollback(asSubscriber(USERS.moussa), (tx) =>
        tx.execute(sql`UPDATE contracts SET body_template = 'Modifié' WHERE id = ${CONTRACTS.a}`),
      );
      expect(update.rowCount).toBe(0);
    });

    it('en espace association de A, une souscriptrice de B ne voit ni le contrat ni la signature de B', async () => {
      await h.as({ space: 'association', associationId: A.id, userId: USERS.fatou }, async (tx) => {
        expect(await contractIds(tx)).toEqual([CONTRACTS.a, CONTRACTS.a2, CONTRACTS.a3]);
        expect(await signatureIds(tx)).toEqual([SIGNATURES.moussa]);
      });
    });
  });

  describe('PDF du contrat signé (files)', () => {
    it('le souscripteur ne lit que ses propres PDF de contrat', async () => {
      expect(await h.as(asSubscriber(USERS.moussa), fileIds)).toEqual([FILES.moussa, FILES.moussaSpare, FILES.moussaB]);
      expect(await h.as(asSubscriber(USERS.aminata), fileIds)).toEqual([FILES.aminata]);
    });

    it('il crée un PDF en attente dans une association où il est inscrit', async () => {
      const created = await h.asRollback(asSubscriber(USERS.moussa), (tx) =>
        insertFile(tx, { id: '00000000-0000-7000-8000-0000000f14f1', association: B.id, owner: USERS.moussa }),
      );
      expect(created.rowCount).toBe(1);
    });

    it.each([
      ['une association où il n’est pas inscrit', USERS.aminata, { association: B.id, owner: USERS.aminata }],
      ['sans association', USERS.moussa, { association: null, owner: USERS.moussa }],
      ['pour une autre personne', USERS.moussa, { association: A.id, owner: USERS.aminata }],
      [
        'déjà analysé (clean, empreinte posée)',
        USERS.moussa,
        { association: A.id, owner: USERS.moussa, status: 'clean' },
      ],
      ['d’un autre usage', USERS.moussa, { association: A.id, owner: USERS.moussa, purpose: 'invoice_pdf' }],
      ['en attente mais avec une empreinte', USERS.moussa, { association: A.id, owner: USERS.moussa, sha256: SHA }],
      ['dans un autre compartiment', USERS.moussa, { association: A.id, owner: USERS.moussa, bucket: 'cotiz-proofs' }],
      [
        'à la clé d’objet d’une autre association',
        USERS.moussa,
        {
          association: A.id,
          owner: USERS.moussa,
          key: `${B.id}/contract_pdf/00000000-0000-7000-8000-0000000f14f2.pdf`,
        },
      ],
      [
        'avec une expiration',
        USERS.moussa,
        { association: A.id, owner: USERS.moussa, expires: '2027-01-01T00:00:00Z' },
      ],
    ] as const)('il ne crée pas de PDF de contrat %s', async (_case, user, row) => {
      const error = await errorOf(
        h.asRollback(asSubscriber(user), (tx) =>
          insertFile(tx, { id: '00000000-0000-7000-8000-0000000f14f2', ...row }),
        ),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('pas de PDF de contrat sans inscription en attente de signature dans l’association', async () => {
      const error = await withEnrollmentStatus(ENROLLMENTS.fatou, 'active', () =>
        errorOf(
          h.asRollback(asSubscriber(USERS.fatou), (tx) =>
            insertFile(tx, { id: '00000000-0000-7000-8000-0000000f14f4', association: B.id, owner: USERS.fatou }),
          ),
        ),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('il ne modifie ni ne supprime son PDF (aucune ligne touchée)', async () => {
      const touched = await h.asRollback(asSubscriber(USERS.moussa), async (tx) => {
        const updated = await tx.execute(sql`UPDATE files SET sha256 = ${SHA}, scan_status = 'clean'
                                              WHERE id = ${FILES.moussa}`);
        const deleted = await tx.execute(sql`DELETE FROM files WHERE id = ${FILES.moussa}`);
        return [updated.rowCount, deleted.rowCount];
      });
      expect(touched).toEqual([0, 0]);
    });
  });

  describe('autres espaces', () => {
    it('sans contexte : aucun contrat ni signature', async () => {
      expect(await h.count(null, 'contracts')).toBe(0);
      expect(await h.count(null, 'contract_signatures')).toBe(0);
      expect(await h.countWithoutTenantDatabase('contracts')).toBe(0);
      expect(await h.countWithoutTenantDatabase('contract_signatures')).toBe(0);
    });

    it.each([
      ['auth', { space: 'auth', userId: USERS.moussa }],
      ['public', { space: 'public' }],
    ] as const)('espace %s : aucun contrat ni signature', async (_name, context) => {
      await h.as(context, async (tx) => {
        expect(await contractIds(tx)).toEqual([]);
        expect(await signatureIds(tx)).toEqual([]);
      });
    });

    it('espace system : rien sans association (aucune politique system_access), celles de A avec A', async () => {
      expect(await asSystem(h, null, 'contracts')).toEqual([]);
      expect(await asSystem(h, null, 'contract_signatures')).toEqual([]);
      expect(await asSystem(h, A.id, 'contracts')).toEqual([CONTRACTS.a, CONTRACTS.a2, CONTRACTS.a3]);
      expect(await asSystem(h, A.id, 'contract_signatures')).toEqual([SIGNATURES.moussa]);
    });
  });

  describe('invariants', () => {
    it('un contrat verrouillé ne se modifie plus (contract_locked), même en superutilisateur', async () => {
      const manager = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          tx.execute(sql`UPDATE contracts SET body_template = 'Modifié' WHERE id = ${CONTRACTS.a}`),
        ),
      );
      expect({ code: pgCode(manager), message: pgMessage(manager) }).toEqual({
        code: 'P0001',
        message: 'contract_locked',
      });
      const superuser = await errorOf(
        h.superuserRollback((c) => c.query(`UPDATE contracts SET locked_at = NULL WHERE id = $1`, [CONTRACTS.a])),
      );
      expect(pgMessage(superuser)).toBe('contract_locked');
    });

    it('un brouillon se modifie, puis se verrouille', async () => {
      const updated = await h.asRollback(asManagerOf(A), async (tx) => {
        await tx.execute(sql`UPDATE contracts SET body_template = 'Nouveau' WHERE id = ${CONTRACTS.a2}`);
        return tx.execute(sql`UPDATE contracts SET locked_at = now() WHERE id = ${CONTRACTS.a2}`);
      });
      expect(updated.rowCount).toBe(1);
    });

    it.each(['cotiz_app', 'cotiz_platform'] as const)(
      '%s : UPDATE, DELETE et TRUNCATE d’une signature refusés par les droits',
      async (role) => {
        for (const statement of [
          `UPDATE contract_signatures SET consent_text = 'x'`,
          `DELETE FROM contract_signatures`,
          `TRUNCATE contract_signatures`,
        ]) {
          const error = await asRole(h.db.urlFor(role), (c) => errorOf(c.query(statement)));
          expect({ statement, code: pgCode(error) }).toEqual({ statement, code: '42501' });
        }
      },
    );

    it.each([
      ['UPDATE', `UPDATE contract_signatures SET consent_text = 'x'`],
      ['DELETE', `DELETE FROM contract_signatures`],
      ['TRUNCATE', `TRUNCATE contract_signatures CASCADE`],
    ])('%s d’une signature refusé même au superutilisateur (append_only)', async (verb, statement) => {
      const error = await errorOf(h.superuserRollback((c) => c.query(statement)));
      expect({ verb, message: pgMessage(error) }).toEqual({ verb, message: 'append_only' });
    });
  });

  describe('politiques affaiblies : le test échoue', () => {
    it('tenant_isolation de contracts ouverte : A lit le contrat de B', async () => {
      const leaked = await h.withPolicy('contracts', 'tenant_isolation', { using: 'true', withCheck: 'true' }, () =>
        h.as(asManagerOf(A), contractIds),
      );
      expect(leaked).toContain(CONTRACTS.b);
    });

    it('tenant_isolation de contract_signatures ouverte : A lit la signature de B', async () => {
      const leaked = await h.withPolicy(
        'contract_signatures',
        'tenant_isolation',
        { using: 'true', withCheck: 'true' },
        () => h.as(asManagerOf(A), signatureIds),
      );
      expect(leaked).toContain(SIGNATURES.fatou);
    });

    it('subscriber_enrolled_read sans l’inscription : Moussa lit tous les contrats', async () => {
      const leaked = await h.withPolicy(
        'contracts',
        'subscriber_enrolled_read',
        { using: "app_space() = 'subscriber'", withCheck: null },
        () => h.as(asSubscriber(USERS.moussa), contractIds),
      );
      expect(leaked).toEqual([CONTRACTS.a, CONTRACTS.a2, CONTRACTS.b, CONTRACTS.a3]);
    });

    it('subscriber_enrolled_read sans l’espace : une route /me de gestionnaire lit ses contrats', async () => {
      const leaked = await h.withPolicy(
        'contracts',
        'subscriber_enrolled_read',
        {
          using:
            'EXISTS (SELECT 1 FROM enrollments e WHERE e.project_id = contracts.project_id AND e.user_id = app_user_id())',
          withCheck: null,
        },
        () =>
          // La sous-requête lit enrollments sous RLS : sa politique souscripteur, elle aussi sans l'espace.
          h.withPolicy(
            'enrollments',
            'subscriber_self_read',
            { using: 'user_id = app_user_id()', withCheck: null },
            () => h.as(meAsManager(USERS.moussa), contractIds),
          ),
      );
      expect(leaked).toEqual([CONTRACTS.a, CONTRACTS.b]);
    });

    it('subscriber_self_read sans la personne : Moussa lit la signature de Fatou', async () => {
      const leaked = await h.withPolicy(
        'contract_signatures',
        'subscriber_self_read',
        { using: "app_space() = 'subscriber'", withCheck: null },
        () => h.as(asSubscriber(USERS.moussa), signatureIds),
      );
      expect(leaked).toContain(SIGNATURES.fatou);
    });

    it('subscriber_self_read sans l’espace : une route /me de gestionnaire lit ses signatures', async () => {
      const leaked = await h.withPolicy(
        'contract_signatures',
        'subscriber_self_read',
        { using: 'user_id = app_user_id()', withCheck: null },
        () => h.as(meAsManager(USERS.moussa), signatureIds),
      );
      expect(leaked).toEqual([SIGNATURES.moussa]);
    });

    it('subscriber_sign sans la personne : Moussa signerait pour Aminata', async () => {
      const written = await h.withPolicy(
        'contract_signatures',
        'subscriber_sign',
        { using: null, withCheck: "app_space() = 'subscriber'" },
        () => h.asRollback(asSubscriber(USERS.moussa), (tx) => insertSignature(tx, aminataSignature)),
      );
      expect(written.rowCount).toBe(1);
    });

    it('subscriber_sign sans l’inscription ni le contrat : Aminata signerait le contrat de B', async () => {
      const written = await h.withPolicy(
        'contract_signatures',
        'subscriber_sign',
        { using: null, withCheck: "user_id = app_user_id() AND app_space() = 'subscriber'" },
        () =>
          h.asRollback(asSubscriber(USERS.aminata), (tx) =>
            insertSignature(tx, { ...aminataSignature, contract: CONTRACTS.b }),
          ),
      );
      expect(written.rowCount).toBe(1);
    });

    it('subscriber_sign sans l’espace : une route /me de gestionnaire signerait', async () => {
      const written = await h.withPolicy(
        'contract_signatures',
        'subscriber_sign',
        { using: null, withCheck: 'user_id = app_user_id()' },
        () =>
          h.withoutPolicy('contract_signatures', 'subscriber_insert_only', () =>
            h.asRollback(meAsManager(USERS.aminata), (tx) => insertSignature(tx, aminataSignature)),
          ),
      );
      expect(written.rowCount).toBe(1);
    });

    it('subscriber_insert_only retirée : un gestionnaire de A signe à la place d’Aminata', async () => {
      const written = await h.withoutPolicy('contract_signatures', 'subscriber_insert_only', () =>
        h.asRollback(asManagerOf(A), (tx) => insertSignature(tx, aminataSignature)),
      );
      expect(written.rowCount).toBe(1);
    });

    it('subscriber_sign sans la clause du PDF : Aminata signe avec le PDF de Moussa', async () => {
      // La clé étrangère vers files ignore la RLS : seule la clause du PDF empêche de citer celui d'un autre.
      const withoutFile = `user_id = app_user_id() AND app_space() = 'subscriber'
        AND EXISTS (SELECT 1 FROM enrollments e JOIN contracts c ON c.project_id = e.project_id AND c.association_id = e.association_id
                     WHERE e.id = contract_signatures.enrollment_id AND e.user_id = app_user_id()
                       AND e.association_id = contract_signatures.association_id AND e.status = 'pending_signature'
                       AND c.id = contract_signatures.contract_id AND c.locked_at IS NOT NULL)`;
      const written = await h.withPolicy(
        'contract_signatures',
        'subscriber_sign',
        { using: null, withCheck: withoutFile },
        () =>
          h.asRollback(asSubscriber(USERS.aminata), (tx) =>
            insertSignature(tx, { ...aminataSignature, file: FILES.moussaSpare }),
          ),
      );
      expect(written.rowCount).toBe(1);
    });

    it('subscriber_contract_pdf_read sans l’espace : une route /me de gestionnaire lit ses PDF', async () => {
      const leaked = await h.withPolicy(
        'files',
        'subscriber_contract_pdf_read',
        { using: "owner_user_id = app_user_id() AND purpose = 'contract_pdf'", withCheck: null },
        () => h.as(meAsManager(USERS.moussa), fileIds),
      );
      expect(leaked).toContain(FILES.moussa);
    });

    it('subscriber_contract_pdf_create sans l’état ni la clé : Moussa crée un PDF déjà « complété »', async () => {
      const written = await h.withPolicy(
        'files',
        'subscriber_contract_pdf_create',
        {
          using: null,
          withCheck: `app_space() = 'subscriber' AND owner_user_id = app_user_id() AND purpose = 'contract_pdf'
            AND EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = app_user_id() AND e.association_id = files.association_id
                          AND e.status = 'pending_signature')`,
        },
        () =>
          h.asRollback(asSubscriber(USERS.moussa), (tx) =>
            insertFile(tx, {
              id: '00000000-0000-7000-8000-0000000f14f5',
              association: A.id,
              owner: USERS.moussa,
              status: 'clean',
              key: `${B.id}/contract_pdf/autre.pdf`,
            }),
          ),
      );
      expect(written.rowCount).toBe(1);
    });

    it('subscriber_contract_pdf_read sans la personne : Moussa lit le PDF de Fatou', async () => {
      const leaked = await h.withPolicy(
        'files',
        'subscriber_contract_pdf_read',
        { using: "app_space() = 'subscriber' AND purpose = 'contract_pdf'", withCheck: null },
        () => h.as(asSubscriber(USERS.moussa), fileIds),
      );
      expect(leaked).toContain(FILES.fatou);
    });

    it('subscriber_contract_pdf_create sans l’inscription : Aminata crée un PDF dans B', async () => {
      const written = await h.withPolicy(
        'files',
        'subscriber_contract_pdf_create',
        {
          using: null,
          withCheck: "app_space() = 'subscriber' AND owner_user_id = app_user_id() AND purpose = 'contract_pdf'",
        },
        () =>
          h.asRollback(asSubscriber(USERS.aminata), (tx) =>
            insertFile(tx, { id: '00000000-0000-7000-8000-0000000f14f3', association: B.id, owner: USERS.aminata }),
          ),
      );
      expect(written.rowCount).toBe(1);
    });
  });
});
