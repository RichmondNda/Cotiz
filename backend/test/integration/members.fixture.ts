import { A, B, USERS } from '../isolation/harness.js';
import { type ProjectsFixture, startProjectsFixture } from './projects.fixture.js';

/**
 * Jeu des tests du module members (lot 2.3) : celui des projets (A en Essentiel avec Awa owner, Aminata manager, Koffi
 * viewer ; B en Pro avec Koffi owner), plus des projets aux inscriptions ouvertes et des téléphones :
 * - Moussa (souscripteur de A), Fatou (souscriptrice de B, retirée de A), Awa (owner de A, souscriptrice de B) ;
 * - PROJECTS.a et PROJECTS.a2 dans A, PROJECTS.b dans B, aux inscriptions ouvertes ; PROJECTS.draftA en brouillon ;
 *   tous mensuels à dates fixes (25 000 F le 5, du 2026-03-01 au 2027-08-31, délai de grâce 5 jours), sauf
 *   PROJECTS.rollingA (mêmes conditions, cycle roulant, sans fin).
 */

export const PROJECTS = {
  a: '00000000-0000-7000-8000-00000000c301',
  a2: '00000000-0000-7000-8000-00000000c302',
  b: '00000000-0000-7000-8000-00000000c303',
  draftA: '00000000-0000-7000-8000-00000000c304',
  /** Cycle roulant de A, aux inscriptions ouvertes. */
  rollingA: '00000000-0000-7000-8000-00000000c305',
} as const;

export const PHONES = {
  moussa: '+2250544218790',
  fatou: '+2250122334455',
  awa: '+2250708091011',
  /** Numéro valide que personne n'a. */
  unknown: '+2250707070707',
} as const;

export interface MembersFixture extends ProjectsFixture {
  /** Inscrit la personne au projet (posé en base, hors API). */
  enroll: (projectId: string, userId: string, associationId?: string) => Promise<string>;
  /**
   * Entre deux tests : inscriptions, échéances, événements de membres effacés ; comptes créés depuis le début du jeu
   * effacés (avec leurs codes, profils, appartenances) ; appartenances souscripteur du jeu rétablies.
   */
  resetMembers: () => Promise<void>;
}

const PROJECT_INSERT = `INSERT INTO projects (id, association_id, name, description, status, installment_amount,
                                              frequency, due_day, schedule_type, start_date, end_date, created_by)
                        VALUES ($1, $2, $3, '', $4, 25000, 'monthly', 5, 'fixed', '2026-03-01', '2027-08-31', $5)`;

export async function startMembersFixture(env: Record<string, string> = {}): Promise<MembersFixture> {
  const f = await startProjectsFixture(env);
  const seeded = ((await f.h.superuser('SELECT array_agg(id) AS ids FROM users')).rows as [{ ids: string[] }])[0].ids;
  const seededMemberships = (
    await f.h.superuser(`SELECT id, status, removed_at FROM memberships WHERE role = 'subscriber'`)
  ).rows as {
    id: string;
    status: string;
    removed_at: Date | null;
  }[];
  const projects = [
    [PROJECTS.a, A.id, 'Centre communautaire', 'enrolling', USERS.awa],
    [PROJECTS.a2, A.id, 'Cotisation annuelle', 'active', USERS.awa],
    [PROJECTS.b, B.id, 'Projet de Man', 'enrolling', USERS.koffi],
    [PROJECTS.draftA, A.id, 'Brouillon', 'draft', USERS.awa],
  ] as const;
  for (const row of projects) await f.h.superuser(PROJECT_INSERT, [...row]);
  await f.h.superuser(
    `INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency, due_day,
                           schedule_type, start_date, created_by)
     VALUES ($1, $2, 'Caisse de solidarité', '', 'enrolling', 25000, 'monthly', 5, 'rolling', '2026-03-01', $3)`,
    [PROJECTS.rollingA, A.id, USERS.awa],
  );
  await f.h.superuser(
    `UPDATE users SET phone_e164 = p.phone, last_name = p.last_name
       FROM unnest($1::uuid[], $2::text[], $3::text[]) AS p(id, phone, last_name) WHERE users.id = p.id`,
    [
      [USERS.moussa, USERS.fatou, USERS.awa],
      [PHONES.moussa, PHONES.fatou, PHONES.awa],
      ['Diarra', 'Traoré', 'Koné'],
    ],
  );

  const enroll: MembersFixture['enroll'] = async (projectId, userId, associationId = A.id) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at)
       VALUES ($1, $2, $3, $4, 'active', '2026-03-01', now())`,
      [id, associationId, projectId, userId],
    );
    return id;
  };
  const resetMembers = async () => {
    await f.h.superuser('DELETE FROM installments');
    await f.h.superuser('DELETE FROM enrollments');
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type LIKE 'member.%' OR event_type LIKE 'activation.%'`);
    await f.h.superuser(`DELETE FROM one_time_codes WHERE purpose = 'activation' AND association_id IS NOT NULL`);
    await f.h.superuser('DELETE FROM subscriber_profiles');
    await f.h.superuser(`DELETE FROM memberships WHERE role = 'subscriber' AND NOT (id = ANY($1::uuid[]))`, [
      seededMemberships.map((m) => m.id),
    ]);
    await f.h.superuser(
      `UPDATE memberships SET status = s.status::memberships_status, removed_at = s.removed_at
         FROM unnest($1::uuid[], $2::text[], $3::timestamptz[]) AS s(id, status, removed_at) WHERE memberships.id = s.id`,
      [
        seededMemberships.map((m) => m.id),
        seededMemberships.map((m) => m.status),
        seededMemberships.map((m) => m.removed_at),
      ],
    );
    for (const table of ['credentials', 'one_time_codes', 'sessions', 'memberships']) {
      await f.h.superuser(`DELETE FROM ${table} WHERE NOT (user_id = ANY($1::uuid[]))`, [seeded]);
    }
    await f.h.superuser('DELETE FROM users WHERE NOT (id = ANY($1::uuid[]))', [seeded]);
  };
  return { ...f, enroll, resetMembers };
}
