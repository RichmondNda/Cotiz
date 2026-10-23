import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  A,
  asManagerOf,
  asSubscriber,
  errorOf,
  type IsolationHarness,
  isRlsViolation,
  pgCode,
  pgConstraint,
  seedAssociations,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Table onboarding du lot 1.3 (base migrée). association_requests n'est écrite par cotiz_app qu'en espace public
 * (public_submit, INSERT seul : le formulaire ne relit jamais sa demande) ; la plateforme la lit et la traite par
 * cotiz_platform (BYPASSRLS, routes /platform). Aucun autre espace n'y lit ni n'y écrit. Chaque politique est aussi
 * testée affaiblie.
 */

const PLAN = '00000000-0000-7000-8000-0000000001a1';
const REQUESTS = {
  pending: '00000000-0000-7000-8000-0000000013a1',
  approved: '00000000-0000-7000-8000-0000000013a2',
} as const;

/** INSERT du formulaire public : identifiant et référence calculés avant, sans RETURNING (aucune lecture permise). */
const submit = (tx: Tx, id: string = crypto.randomUUID()) =>
  tx.execute(sql`INSERT INTO association_requests (id, reference, association_name, association_type, city, country,
                   activity_description, contact_first_name, contact_last_name, contact_title, contact_email,
                   contact_phone, estimated_subscribers, terms_accepted_at)
                 VALUES (${id}, 'DEM-2026-' || lpad(nextval('association_request_number_seq')::text, 5, '0'),
                   'Tontine des Lagunes', 'tontine', 'Abidjan', 'CI', 'Tontine mensuelle', 'Aya', 'Kouassi',
                   'Présidente', 'aya@lagunes.ci', '+2250700000099', '21_50', now())`);

/** Dépôt public dont une colonne réservée à la plateforme est déjà remplie (demande « pré-décidée »). */
const PRE_DECIDED: readonly (readonly [string, string])[] = [
  ['status', `'approved'::association_requests_status`],
  ['viewed_by', `'${USERS.awa}'::uuid`],
  ['viewed_at', 'now()'],
  ['decided_by', `'${USERS.awa}'::uuid`],
  ['decided_at', 'now()'],
  ['rejection_reason_code', `'spam'`],
  ['rejection_message', `'Refusée'`],
  ['internal_note', `'Note'`],
  ['association_id', `'${A.id}'::uuid`],
];

const submitWith = (tx: Tx, column: string, value: string) =>
  tx.execute(sql`INSERT INTO association_requests (id, reference, association_name, association_type, city, country,
                   activity_description, contact_first_name, contact_last_name, contact_title, contact_email,
                   contact_phone, estimated_subscribers, terms_accepted_at, ${sql.identifier(column)})
                 VALUES (gen_random_uuid(), 'DEM-2026-' || lpad(nextval('association_request_number_seq')::text, 5, '0'),
                   'Tontine des Lagunes', 'tontine', 'Abidjan', 'CI', 'Tontine mensuelle', 'Aya', 'Kouassi',
                   'Présidente', 'aya@lagunes.ci', '+2250700000099', '21_50', now(), ${sql.raw(value)})`);

const requests = (tx: Tx) =>
  tx
    .execute<{ id: string }>(sql`SELECT id FROM association_requests ORDER BY id`)
    .then((r) => r.rows.map((row) => row.id));

const PLATFORM_ROLE_CONTEXTS = [
  ['association', asManagerOf(A)],
  ['souscripteur', asSubscriber(USERS.moussa)],
  ['plateforme (cotiz_app)', { space: 'platform', userId: USERS.awa }],
  ['auth', { space: 'auth', userId: USERS.awa }],
] as const;

describe('table onboarding : association_requests (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO plans (id, code, name, price_monthly, price_yearly, features)
       VALUES ($1, 'essentiel', 'Essentiel', 10000, 120000, '{}')`,
      [PLAN],
    );
    await h.superuser(
      `INSERT INTO association_requests (id, reference, association_name, association_type, city, country,
         activity_description, contact_first_name, contact_last_name, contact_title, contact_email, contact_phone,
         estimated_subscribers, desired_plan_id, terms_accepted_at, status, decided_by, decided_at, association_id)
       VALUES ($1, 'DEM-2026-90001', 'Entraide Yopougon', 'association', 'Abidjan', 'CI', 'Entraide', 'Awa', 'Koné',
               'Présidente', 'awa@entraide.ci', '+2250708091011', '51_200', $3, now(), 'pending', NULL, NULL, NULL),
              ($2, 'DEM-2026-90002', 'Ressortissants de Man', 'association', 'Abidjan', 'CI', 'Solidarité', 'Koffi',
               'Yao', 'Trésorier', 'koffi@man.ci', '+2250700000001', '21_50', NULL, now(), 'approved', $4, now(), $5)`,
      [REQUESTS.pending, REQUESTS.approved, PLAN, USERS.awa, A.id],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('espace public : dépôt seulement', () => {
    it('le formulaire public dépose une demande', async () => {
      const id = crypto.randomUUID();
      await h.asRollback({ space: 'public' }, async (tx) => {
        const inserted = await submit(tx, id);
        expect(inserted.rowCount).toBe(1);
      });
    });

    it('le formulaire public dépose aussi avec un utilisateur dans le contexte (la politique ne dépend que de l’espace)', async () => {
      await h.asRollback({ space: 'public', userId: USERS.awa }, async (tx) => {
        expect((await submit(tx)).rowCount).toBe(1);
      });
    });

    it.each(PRE_DECIDED)('une demande déposée avec %s déjà rempli est refusée', async (column, value) => {
      const error = await errorOf(h.asRollback({ space: 'public' }, (tx) => submitWith(tx, column, value)));
      expect(isRlsViolation(error)).toBe(true);
    });

    it('le formulaire public ne relit aucune demande, pas même la sienne', async () => {
      const seen = await h.asRollback({ space: 'public' }, async (tx) => {
        await submit(tx);
        return requests(tx);
      });
      expect(seen).toEqual([]);
    });

    // DELETE : refusé à tous par le droit lui-même (bloc « droits » ci-dessous).
    it('le formulaire public ne modifie aucune demande', async () => {
      const updated = await h.asRollback({ space: 'public' }, (tx) =>
        tx.execute(sql`UPDATE association_requests SET status = 'approved' WHERE id = ${REQUESTS.pending}`),
      );
      expect(updated.rowCount).toBe(0);
    });

    it('INSERT … RETURNING est refusé en espace public (aucune politique de lecture)', async () => {
      const error = await errorOf(
        h.asRollback({ space: 'public' }, (tx) =>
          tx.execute(sql`INSERT INTO association_requests (id, reference, association_name, association_type, city,
                           country, activity_description, contact_first_name, contact_last_name, contact_title,
                           contact_email, contact_phone, estimated_subscribers, terms_accepted_at)
                         VALUES (gen_random_uuid(), 'DEM-2026-99999', 'X', 'association', 'Abidjan', 'CI', 'X', 'A',
                           'B', 'C', 'x@x.ci', '+2250700000098', '1_20', now())
                         RETURNING id`),
        ),
      );
      expect(isRlsViolation(error)).toBe(true);
    });
  });

  describe('autres espaces de cotiz_app : rien', () => {
    it.each(PLATFORM_ROLE_CONTEXTS)('espace %s : aucune demande visible', async (_name, context) => {
      expect(await h.as(context, requests)).toEqual([]);
    });

    it.each(PLATFORM_ROLE_CONTEXTS)('espace %s : ne dépose pas de demande', async (_name, context) => {
      expect(isRlsViolation(await errorOf(h.asRollback(context, (tx) => submit(tx))))).toBe(true);
    });

    it.each(PLATFORM_ROLE_CONTEXTS)('espace %s : ne décide pas d’une demande', async (_name, context) => {
      const updated = await h.asRollback(context, (tx) =>
        tx.execute(sql`UPDATE association_requests SET status = 'rejected' WHERE id = ${REQUESTS.pending}`),
      );
      expect(updated.rowCount).toBe(0);
    });

    it('espace system (worker) : aucune demande (aucun consommateur ne la lit)', async () => {
      const seen = await h.superuserRollback(async (client) => {
        await client.query(`SET LOCAL ROLE cotiz_app; SET LOCAL app.space = 'system'`);
        return (await client.query('SELECT id FROM association_requests')).rowCount;
      });
      expect(seen).toBe(0);
    });

    it('sans contexte, ou sans aucune variable app.* : rien, et aucun dépôt', async () => {
      expect(await h.count(null, 'association_requests')).toBe(0);
      expect(await h.countWithoutTenantDatabase('association_requests')).toBe(0);
      expect(isRlsViolation(await errorOf(h.withoutContext((tx) => submit(tx))))).toBe(true);
    });
  });

  describe('cotiz_platform (routes /platform) : lit et traite toutes les demandes', () => {
    it('lit toutes les demandes et en décide', async () => {
      const seen = await h.superuserRollback(async (client) => {
        await client.query('SET LOCAL ROLE cotiz_platform');
        await client.query(
          `UPDATE association_requests SET status = 'rejected', decided_by = $2, decided_at = now(),
                  rejection_reason_code = 'incomplete'
            WHERE id = $1`,
          [REQUESTS.pending, USERS.awa],
        );
        return (
          await client.query<{ id: string; status: string }>('SELECT id, status FROM association_requests ORDER BY id')
        ).rows;
      });
      expect(seen).toEqual([
        { id: REQUESTS.pending, status: 'rejected' },
        { id: REQUESTS.approved, status: 'approved' },
      ]);
    });
  });

  describe('invariants', () => {
    it('valeurs par défaut : en attente, aucune consultation ni décision', async () => {
      const row = await h.superuserRollback(async (client) => {
        await client.query('SET LOCAL ROLE cotiz_app');
        await client.query(`SET LOCAL app.space = 'public'`);
        const id = crypto.randomUUID();
        await client.query(
          `INSERT INTO association_requests (id, reference, association_name, association_type, city, country,
             activity_description, contact_first_name, contact_last_name, contact_title, contact_email, contact_phone,
             estimated_subscribers, terms_accepted_at)
           VALUES ($1, 'DEM-2026-99990', 'X', 'association', 'Abidjan', 'CI', 'X', 'A', 'B', 'C', 'x@x.ci',
                   '+2250700000097', '1_20', now())`,
          [id],
        );
        await client.query('RESET ROLE');
        return (
          await client.query<Record<string, unknown>>(
            `SELECT status, viewed_by, viewed_at, decided_by, decided_at, association_id, created_at IS NOT NULL AS dated
             FROM association_requests WHERE id = $1`,
            [id],
          )
        ).rows[0];
      });
      expect(row).toEqual({
        status: 'pending',
        viewed_by: null,
        viewed_at: null,
        decided_by: null,
        decided_at: null,
        association_id: null,
        dated: true,
      });
    });

    it('référence unique', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(
            `INSERT INTO association_requests (id, reference, association_name, association_type, city, country,
               activity_description, contact_first_name, contact_last_name, contact_title, contact_email,
               contact_phone, estimated_subscribers, terms_accepted_at)
             SELECT gen_random_uuid(), reference, association_name, association_type, city, country,
                    activity_description, contact_first_name, contact_last_name, contact_title, contact_email,
                    contact_phone, estimated_subscribers, terms_accepted_at
               FROM association_requests WHERE id = $1`,
            [REQUESTS.pending],
          ),
        ),
      );
      expect(pgCode(error)).toBe('23505');
      expect(pgConstraint(error)).toBe('association_requests_reference_key');
    });

    it('la séquence des références avance pour cotiz_app (droit USAGE)', async () => {
      const values = await h.asRollback({ space: 'public' }, async (tx) => {
        const read = () =>
          tx
            .execute<{ n: string }>(sql`SELECT nextval('association_request_number_seq')::text AS n`)
            .then((r) => Number(r.rows[0]?.n));
        return [await read(), await read()];
      });
      expect(values[1]).toBe((values[0] ?? 0) + 1);
    });

    it.each([
      ['viewed_by', 'users', crypto.randomUUID()],
      ['decided_by', 'users', crypto.randomUUID()],
      ['desired_plan_id', 'plans', crypto.randomUUID()],
      ['association_id', 'associations', crypto.randomUUID()],
    ])('%s référence %s', async (column, _target, unknown) => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(`UPDATE association_requests SET ${column} = $2 WHERE id = $1`, [REQUESTS.pending, unknown]),
        ),
      );
      expect(pgCode(error)).toBe('23503');
    });

    it.each([
      ['estimated_subscribers', "'1000'"],
      ['status', "'cancelled'"],
    ])('%s hors énumération refusé', async (column, value) => {
      const error = await h.superuserRollback((client) =>
        errorOf(client.query(`UPDATE association_requests SET ${column} = ${value} WHERE id = $1`, [REQUESTS.pending])),
      );
      expect(pgCode(error)).toBe('22P02');
    });

    it('associations.registration_number : facultatif, repris de la demande', async () => {
      const value = await h.superuserRollback(async (client) => {
        await client.query(`UPDATE associations SET registration_number = 'CI-ABJ-2024-B-1234' WHERE id = $1`, [A.id]);
        return (
          await client.query<{ registration_number: string | null }>(
            'SELECT registration_number FROM associations WHERE id = $1',
            [A.id],
          )
        ).rows[0];
      });
      expect(value).toEqual({ registration_number: 'CI-ABJ-2024-B-1234' });
    });
  });

  describe('droits : une demande ne se supprime jamais', () => {
    const deleteAs = (role: 'cotiz_app' | 'cotiz_platform') =>
      h.superuserRollback(async (client) => {
        await client.query(`SET LOCAL ROLE ${role}; SET LOCAL app.space = 'public'`);
        return errorOf(client.query('DELETE FROM association_requests WHERE id = $1', [REQUESTS.approved]));
      });

    it.each(['cotiz_app', 'cotiz_platform'] as const)('%s : DELETE refusé par le droit (42501)', async (role) => {
      expect(pgCode(await deleteAs(role))).toBe('42501');
    });

    it('le test échoue si le droit revient : DELETE accordé à cotiz_platform, la suppression passe', async () => {
      await h.migrator('GRANT DELETE ON association_requests TO cotiz_platform');
      try {
        expect(pgCode(await deleteAs('cotiz_platform'))).toBeUndefined();
      } finally {
        await h.migrator('REVOKE DELETE ON association_requests FROM cotiz_platform');
      }
    });
  });

  describe('les tests échouent si une politique manque ou s’élargit', () => {
    const open = { using: null, withCheck: 'true' };

    it('public_submit ouverte à tous les espaces : une association dépose une demande', async () => {
      const inserted = await h.withPolicy('association_requests', 'public_submit', open, () =>
        h.asRollback(asManagerOf(A), (tx) => submit(tx)),
      );
      expect(inserted.rowCount).toBe(1);
    });

    it('public_submit retirée : le formulaire public ne dépose plus', async () => {
      const error = await h.withoutPolicy('association_requests', 'public_submit', () =>
        errorOf(h.asRollback({ space: 'public' }, (tx) => submit(tx))),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('public_submit réduite à l’espace : une demande pré-approuvée passe (détecté)', async () => {
      const spaceOnly = { using: null, withCheck: `app_space() = 'public'` };
      const inserted = await h.withPolicy('association_requests', 'public_submit', spaceOnly, () =>
        h.asRollback({ space: 'public' }, (tx) => submitWith(tx, 'status', `'approved'::association_requests_status`)),
      );
      expect(inserted.rowCount).toBe(1);
    });

    it('RLS désactivée : l’espace public lit toutes les demandes (détecté)', async () => {
      const seen = await h.withRlsDisabled('association_requests', () => h.as({ space: 'public' }, requests));
      expect(seen).toEqual([REQUESTS.pending, REQUESTS.approved]);
    });
  });
});
