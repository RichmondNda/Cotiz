import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, PLANS, STAFF } from './platform-associations.fixture.js';
import { type MembersFixture, PHONES, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Lot 2.3 · étape 3 : inscription unitaire (en.create, architecture/04 § 4.3). En une transaction : compte
 * (pending_activation) si le numéro est nouveau, appartenance souscripteur (active dès l'inscription : révision de Q8),
 * inscription, échéances par generateSchedule() avec leur statut initial par installmentStatus() (Q3), quota, code
 * d'activation et message prêt (`handoff`) pour un compte non activé créé par l'association (B1 : jamais pour un compte
 * créé ailleurs). Le même numéro ne crée jamais deux comptes.
 *
 * Horloge : Date figée (puis qui avance) au 2026-11-08 10:00 UTC, dans ce processus qui sert aussi l'API ; la base garde
 * son heure réelle (`now()`), d'où `dbNow()` pour filtrer audits et événements. Projets du jeu (members.fixture) :
 * 25 000 F le 5 de chaque mois depuis le 2026-03-01 (séquence 1 = 2026-03-05), délai de grâce 5 jours. Au 2026-11-08,
 * une échéance est en retard jusqu'à celle du 2026-10-05 (en retard depuis le 11), celle du 2026-11-05 est due (délai de
 * grâce), les suivantes à venir.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Created = ENDPOINTS['en.create'].operations.create.response.body;

/** Numéros valides que personne n'a au départ. */
const NEW = { kofi: '+2250711223344', ama: '+2250722334455', yao: '+2250733445566', owner: '+2250744556677' } as const;

interface InstallmentRow {
  kind: string;
  sequence: number;
  due_date: string;
  amount_due: string;
  amount_paid: string;
  status: string;
  late_since: string | null;
  association_id: string;
  project_id: string;
  user_id: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Date de la séquence `n` (1 = mars 2026), le `day` du mois. */
const monthOf = (n: number, day: number) => {
  const month = 2 + n; // mars = 3
  const year = 2026 + Math.floor((month - 1) / 12);
  return `${String(year)}-${pad(((month - 1) % 12) + 1)}-${pad(day)}`;
};
/** Échéance périodique attendue au 2026-11-08, écrite à la main (règles ci-dessus). */
const periodic = (n: number) => ({
  kind: 'periodic',
  sequence: n,
  due_date: monthOf(n, 5),
  amount_due: '25000',
  amount_paid: '0',
  status: n <= 8 ? 'late' : n === 9 ? 'due' : 'upcoming',
  late_since: n <= 8 ? monthOf(n, 11) : null,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('inscription unitaire (en.create)', () => {
  let f: MembersFixture;

  const enroll = (body: unknown, options: { aid?: string; pid?: string; token?: string; key?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/projects/${options.pid ?? PROJECTS.a}/enrollments`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
      headers: { 'idempotency-key': options.key ?? crypto.randomUUID() },
    });
  const created = async (body: unknown, options: Parameters<typeof enroll>[1] = {}) => {
    const res = await enroll(body, options);
    expect(res.status).toBe(201);
    return Created.parse(await res.json());
  };
  const newMember = (phone: string, extra: Record<string, unknown> = {}) => ({
    phone,
    firstName: 'Kofi',
    lastName: 'Annan',
    ...extra,
  });
  const dbNow = async () => ((await f.h.superuser('SELECT clock_timestamp() AS t')).rows as [{ t: Date }])[0].t;
  const usersWithPhone = async (phone: string) =>
    (await f.h.superuser('SELECT id, status, email, first_name FROM users WHERE phone_e164 = $1', [phone])).rows as {
      id: string;
      status: string;
      email: string | null;
      first_name: string;
    }[];
  const installmentsOf = async (enrollmentId: string) =>
    (
      await f.h.superuser(
        `SELECT kind, sequence, due_date::text, amount_due::text, amount_paid::text, status, late_since::text,
                association_id, project_id, user_id
           FROM installments WHERE enrollment_id = $1 ORDER BY sequence`,
        [enrollmentId],
      )
    ).rows as InstallmentRow[];
  /** Échéances sans leur rattachement (vérifié à part). */
  const linesOf = async (enrollmentId: string) =>
    (await installmentsOf(enrollmentId)).map((row) => ({
      kind: row.kind,
      sequence: row.sequence,
      due_date: row.due_date,
      amount_due: row.amount_due,
      amount_paid: row.amount_paid,
      status: row.status,
      late_since: row.late_since,
    }));
  const subscriberMemberships = async (aid: string, userId: string) =>
    (
      await f.h.superuser(
        `SELECT status, invited_by FROM memberships WHERE association_id = $1 AND user_id = $2 AND role = 'subscriber'`,
        [aid, userId],
      )
    ).rows as { status: string; invited_by: string | null }[];
  /** Codes d'activation de la personne ; `live` à l'heure de l'API (Date figée), comme CodeService. */
  const activationCodes = async (userId: string) =>
    (
      await f.h.superuser(
        `SELECT id, association_id, issued_by, code_encrypted IS NOT NULL AS sealed, expires_at > $2 AS live
           FROM one_time_codes WHERE user_id = $1 AND purpose = 'activation' ORDER BY created_at`,
        [userId, new Date()],
      )
    ).rows as { id: string; association_id: string | null; issued_by: string; sealed: boolean; live: boolean }[];

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startMembersFixture();
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await f.resetMembers();
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
  });

  describe('nouveau compte', () => {
    it('compte en attente d’activation, appartenance active, inscription, échéances, code et message prêt', async () => {
      const body = await created(
        newMember(NEW.kofi, { email: 'kofi@exemple.ci', address: 'Cocody, rue des Jardins', startsFrom: '2026-11-01' }),
      );
      const [user] = await usersWithPhone(NEW.kofi);
      if (!user) throw new Error('compte attendu');
      expect(user).toMatchObject({ status: 'pending_activation', email: 'kofi@exemple.ci', first_name: 'Kofi' });

      // Réponse : l'inscription vue par l'onglet Souscripteurs, et le message prêt du code d'activation.
      expect(body.enrollment).toEqual({
        id: body.enrollment.id,
        projectId: PROJECTS.a,
        member: { id: user.id, firstName: 'Kofi', lastName: 'Annan', phone: NEW.kofi, email: 'kofi@exemple.ci' },
        status: 'active',
        // À jour (l'échéance du 2026-11-05 est dans son délai de grâce) et compte non activé.
        standing: 'activation_pending',
        startsFrom: '2026-11-01',
        joinedAt: body.enrollment.joinedAt,
        contractSignedAt: null,
        paid: { amount: 0, currency: 'XOF' },
        // Dates fixes : de novembre 2026 à août 2027, 10 échéances de 25 000 F.
        remaining: { amount: 250_000, currency: 'XOF' },
        lateAmount: { amount: 0, currency: 'XOF' },
        commitment: { amount: 250_000, currency: 'XOF' },
        withdrawnAt: null,
      });
      const handoff = body.handoff;
      if (!handoff) throw new Error('message prêt attendu');
      expect(handoff.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(handoff.recipient).toEqual(body.enrollment.member);
      expect(handoff.message).toContain('votre espace souscripteur');
      expect(handoff.message).toContain(handoff.code);
      expect(handoff.activationUrl).toContain(encodeURIComponent(NEW.kofi));
      expect(handoff.activationUrl).not.toContain(handoff.code);

      // Base : profil créé par A, appartenance souscripteur active, code de A ré-affichable, aucun mot de passe.
      const profile = await f.h.superuser(
        'SELECT address, created_by_association_id FROM subscriber_profiles WHERE user_id = $1',
        [user.id],
      );
      expect(profile.rows).toEqual([{ address: 'Cocody, rue des Jardins', created_by_association_id: A.id }]);
      expect(await subscriberMemberships(A.id, user.id)).toEqual([{ status: 'active', invited_by: USERS.awa }]);
      expect(await activationCodes(user.id)).toMatchObject([
        { association_id: A.id, issued_by: USERS.awa, sealed: true, live: true },
      ]);
      const credentials = await f.h.superuser('SELECT password_hash FROM credentials WHERE user_id = $1', [user.id]);
      expect(credentials.rows).toEqual([{ password_hash: null }]);

      // Échéances : séquences du projet conservées (novembre = 9), rattachées à l'inscription, l'association, le projet
      // et la personne.
      expect(await linesOf(body.enrollment.id)).toEqual(range(9, 18).map(periodic));
      expect(
        new Set(
          (await installmentsOf(body.enrollment.id)).map((r) => `${r.association_id}/${r.project_id}/${r.user_id}`),
        ),
      ).toEqual(new Set([`${A.id}/${PROJECTS.a}/${user.id}`]));
    });

    it('événement member.enrolled et audit, sans code ni téléphone en clair', async () => {
      const since = await dbNow();
      const body = await created(newMember(NEW.kofi, { startsFrom: '2026-11-01' }));
      const userId = body.enrollment.member.id;
      const events = await f.h.superuser(
        `SELECT association_id, actor_user_id, payload FROM outbox_events
          WHERE event_type = 'member.enrolled' AND occurred_at >= $1`,
        [since],
      );
      expect(events.rows).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          payload: { enrollmentId: body.enrollment.id, projectId: PROJECTS.a, userId, isNewAccount: true },
        },
      ]);
      const audit = await f.h.superuser(
        `SELECT actor_user_id, association_id, entity_type, entity_id, after FROM audit_logs
          WHERE action = 'enrollment.create' AND occurred_at >= $1`,
        [since],
      );
      expect(audit.rows).toEqual([
        {
          actor_user_id: USERS.awa,
          association_id: A.id,
          entity_type: 'enrollment',
          entity_id: body.enrollment.id,
          after: {
            projectId: PROJECTS.a,
            userId,
            isNewAccount: true,
            startsFrom: '2026-11-01',
            installments: 10,
            membership: 'created',
            account: 'activation_code_issued',
          },
        },
      ]);
      const text = JSON.stringify([events.rows, audit.rows]);
      expect(text).not.toContain(body.handoff?.code ?? 'code attendu');
      expect(text).not.toContain(NEW.kofi);
    });

    it('email déjà porté par une autre personne : compte créé sans email (écart assumé : la réponse le laisse voir)', async () => {
      const body = await created(newMember(NEW.kofi, { email: 'fatou@test.cotiz.app' }));
      expect(body.enrollment.member.email).toBeNull();
      expect(await usersWithPhone(NEW.kofi)).toMatchObject([{ email: null }]);
    });

    it('numéro déjà porté par un compte : ce compte est inscrit, l’identité saisie est ignorée', async () => {
      const body = await created(newMember(PHONES.moussa, { firstName: 'Autre', lastName: 'Nom' }), {
        pid: PROJECTS.a2,
      });
      expect(body.enrollment.member).toMatchObject({ id: USERS.moussa, firstName: 'Moussa', lastName: 'Diarra' });
      expect(body.handoff).toBeNull();
      expect(await usersWithPhone(PHONES.moussa)).toHaveLength(1);
    });

    it('sans date d’entrée : aujourd’hui (2026-11-08), aucune échéance rétroactive', async () => {
      const body = await created(newMember(NEW.kofi));
      expect(body.enrollment.startsFrom).toBe('2026-11-08');
      expect(await linesOf(body.enrollment.id)).toEqual(range(10, 18).map(periodic));
    });

    it('date d’entrée par défaut dans le fuseau de l’association (UTC−11 : encore le 2026-11-07)', async () => {
      await f.h.superuser(`UPDATE associations SET timezone = 'Pacific/Pago_Pago' WHERE id = $1`, [A.id]);
      try {
        const body = await created(newMember(NEW.kofi));
        expect(body.enrollment.startsFrom).toBe('2026-11-07');
      } finally {
        await f.h.superuser(`UPDATE associations SET timezone = 'Africa/Abidjan' WHERE id = $1`, [A.id]);
      }
    });

    it('entrée au début du projet (rattrapage) : passées en retard (avec leur date), puis due, puis à venir', async () => {
      const body = await created(newMember(NEW.kofi, { startsFrom: '2026-03-01' }));
      const lines = await linesOf(body.enrollment.id);
      expect(lines).toEqual(range(1, 18).map(periodic));
      expect(lines[0]).toMatchObject({ due_date: '2026-03-05', status: 'late', late_since: '2026-03-11' });
      expect(lines[7]).toMatchObject({ due_date: '2026-10-05', status: 'late', late_since: '2026-10-11' });
      expect(lines[8]).toMatchObject({ due_date: '2026-11-05', status: 'due', late_since: null });
      expect(body.enrollment).toMatchObject({
        standing: 'late',
        lateAmount: { amount: 200_000, currency: 'XOF' },
        remaining: { amount: 450_000, currency: 'XOF' },
        commitment: { amount: 450_000, currency: 'XOF' },
      });
    });

    it('fonds d’entrée : séquence 0, dû à la première échéance du souscripteur', async () => {
      await f.h.superuser('UPDATE projects SET entry_fee_amount = 10000 WHERE id = $1', [PROJECTS.a]);
      try {
        const body = await created(newMember(NEW.kofi, { startsFrom: '2026-11-01' }));
        expect(await linesOf(body.enrollment.id)).toEqual([
          { ...periodic(9), kind: 'entry_fee', sequence: 0, amount_due: '10000' },
          ...range(9, 18).map(periodic),
        ]);
        expect(body.enrollment.commitment).toEqual({ amount: 260_000, currency: 'XOF' });
      } finally {
        await f.h.superuser('UPDATE projects SET entry_fee_amount = NULL WHERE id = $1', [PROJECTS.a]);
      }
    });

    it('cycle roulant : les 12 prochaines échéances, sans engagement', async () => {
      const body = await created(newMember(NEW.kofi, { startsFrom: '2026-11-01' }), { pid: PROJECTS.rollingA });
      expect(await linesOf(body.enrollment.id)).toEqual(range(9, 20).map(periodic));
      expect(body.enrollment).toMatchObject({
        commitment: null,
        remaining: { amount: 300_000, currency: 'XOF' },
        lateAmount: { amount: 0, currency: 'XOF' },
      });
    });

    it('cycle roulant, rattrapage : 12 échéances depuis la date d’entrée (horizon rétabli par la tâche mensuelle)', async () => {
      const body = await created(newMember(NEW.kofi, { startsFrom: '2026-03-01' }), { pid: PROJECTS.rollingA });
      expect(await linesOf(body.enrollment.id)).toEqual(range(1, 12).map(periodic));
      expect(body.enrollment.lateAmount).toEqual({ amount: 200_000, currency: 'XOF' });
    });
  });

  describe('compte existant (identifiant retrouvé par mb.lookup)', () => {
    it('compte actif, retiré de l’association : appartenance rétablie, pas de code, isNewAccount false', async () => {
      const since = await dbNow();
      const body = await created({ userId: USERS.fatou, startsFrom: '2026-11-01' });
      expect(body.handoff).toBeNull();
      expect(body.enrollment).toMatchObject({ member: { id: USERS.fatou }, standing: 'up_to_date' });
      expect(await subscriberMemberships(A.id, USERS.fatou)).toMatchObject([{ status: 'active' }]);
      expect(await activationCodes(USERS.fatou)).toEqual([]);
      const events = await f.h.superuser(
        `SELECT payload->>'isNewAccount' AS fresh FROM outbox_events
          WHERE event_type = 'member.enrolled' AND occurred_at >= $1`,
        [since],
      );
      expect(events.rows).toEqual([{ fresh: 'false' }]);
    });

    it('déjà souscripteur de l’association : inscrit au second projet, appartenance inchangée', async () => {
      await created({ userId: USERS.moussa }, { pid: PROJECTS.a2 });
      expect(await subscriberMemberships(A.id, USERS.moussa)).toMatchObject([{ status: 'active' }]);
    });

    it('compte non activé créé par A, inscrit à un autre projet de A : nouveau code de A, le précédent invalidé', async () => {
      const first = await created(newMember(NEW.kofi));
      const userId = first.enrollment.member.id;
      const second = await created({ userId }, { pid: PROJECTS.a2 });
      expect(second.handoff?.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(second.handoff?.code).not.toBe(first.handoff?.code);
      expect(await activationCodes(userId)).toMatchObject([
        { association_id: A.id, live: false, sealed: false },
        { association_id: A.id, live: true, sealed: true },
      ]);
    });

    it('compte non activé créé par une autre association : inscrit sans code, celui d’origine reste le seul valable', async () => {
      const first = await created(newMember(NEW.kofi), { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi });
      const userId = first.enrollment.member.id;
      for (const body of [{ userId }, newMember(NEW.kofi)]) {
        const pid = 'userId' in body ? PROJECTS.a : PROJECTS.a2;
        const res = await created(body, { pid });
        expect(res.handoff).toBeNull();
        expect(res.enrollment.standing).toBe('activation_pending');
      }
      expect(await activationCodes(userId)).toMatchObject([{ association_id: B.id, live: true, sealed: true }]);
      const profile = await f.h.superuser(
        'SELECT created_by_association_id FROM subscriber_profiles WHERE user_id = $1',
        [userId],
      );
      expect(profile.rows).toEqual([{ created_by_association_id: B.id }]);
    });

    it('owner non activé d’une autre association (créé par la plateforme) : aucun code émis par A (prise de contrôle)', async () => {
      const ownerId = '00000000-0000-7000-8000-00000000b1b1';
      await f.h.superuser(
        `INSERT INTO users (id, phone_e164, email, first_name, last_name, status)
         VALUES ($1, $2, 'owner.b@exemple.ci', 'Owner', 'Bé', 'pending_activation')`,
        [ownerId, NEW.owner],
      );
      await f.h.superuser(
        `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
         VALUES (gen_random_uuid(), $1, $2, 'owner', 'active', now())`,
        [B.id, ownerId],
      );
      for (const [body, pid] of [
        [{ userId: ownerId }, PROJECTS.a],
        [newMember(NEW.owner), PROJECTS.a2],
      ] as const) {
        expect((await created(body, { pid })).handoff).toBeNull();
      }
      expect(await activationCodes(ownerId)).toEqual([]);
    });

    it.each(['disabled', 'anonymized'])('compte %s : 409 invalid_state, rien n’est écrit', async (status) => {
      await f.h.superuser(`UPDATE users SET status = $1 WHERE id = $2`, [status, USERS.fatou]);
      try {
        const res = await enroll({ userId: USERS.fatou });
        expect(res.status).toBe(409);
        expect(await codeOf(res)).toBe('invalid_state');
        expect((await f.h.superuser('SELECT count(*)::int AS n FROM enrollments')).rows).toEqual([{ n: 0 }]);
      } finally {
        await f.h.superuser(`UPDATE users SET status = 'active' WHERE id = $1`, [USERS.fatou]);
      }
    });

    it('membre du personnel de la plateforme : 409 invalid_state', async () => {
      const res = await enroll({ userId: STAFF.owner.id });
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('invalid_state');
      expect(await subscriberMemberships(A.id, STAFF.owner.id)).toEqual([]);
    });

    it('identifiant inconnu : 404', async () => {
      const res = await enroll({ userId: '00000000-0000-7000-8000-0000000000ff' });
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    });
  });

  describe('refus', () => {
    it('déjà inscrit à ce projet, même retiré : 409 already_enrolled', async () => {
      const enrollment = await f.enroll(PROJECTS.a, USERS.moussa);
      for (const body of [{ userId: USERS.moussa }, newMember(PHONES.moussa)]) {
        const res = await enroll(body);
        expect(res.status).toBe(409);
        expect(await codeOf(res)).toBe('already_enrolled');
      }
      await f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [
        enrollment,
      ]);
      expect(await codeOf(await enroll({ userId: USERS.moussa }))).toBe('already_enrolled');
    });

    it.each([
      ['draft', PROJECTS.draftA],
      ['completed', PROJECTS.a2],
      ['archived', PROJECTS.a2],
    ])('projet %s : 409 invalid_state, aucun compte créé', async (status, pid) => {
      const [before] = (await f.h.superuser('SELECT status FROM projects WHERE id = $1', [pid])).rows as [
        { status: string },
      ];
      await f.h.superuser('UPDATE projects SET status = $1 WHERE id = $2', [status, pid]);
      try {
        const res = await enroll(newMember(NEW.kofi), { pid });
        expect(res.status).toBe(409);
        expect(await codeOf(res)).toBe('invalid_state');
        expect(await usersWithPhone(NEW.kofi)).toEqual([]);
      } finally {
        await f.h.superuser('UPDATE projects SET status = $1 WHERE id = $2', [before.status, pid]);
      }
    });

    it('projet actif : inscription acceptée', async () => {
      expect((await enroll(newMember(NEW.kofi), { pid: PROJECTS.a2 })).status).toBe(201);
    });

    it('quota de souscripteurs atteint : 409 quota_exceeded (limite et usage), rien n’est écrit', async () => {
      const [{ n: usage }] = (
        await f.h.superuser(
          `SELECT count(*)::int AS n FROM memberships
            WHERE association_id = $1 AND role = 'subscriber' AND status <> 'removed'`,
          [A.id],
        )
      ).rows as [{ n: number }];
      await f.h.superuser('UPDATE plans SET max_subscribers = $1 WHERE id = $2', [usage, PLANS.essentiel]);
      try {
        const res = await enroll(newMember(NEW.kofi));
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: 'quota_exceeded', limit: usage, usage });
        expect(await usersWithPhone(NEW.kofi)).toEqual([]);
        // Retiré de A : le rétablir compte aussi ; déjà souscripteur de A : ne compte pas de plus.
        expect(await codeOf(await enroll({ userId: USERS.fatou }))).toBe('quota_exceeded');
        expect((await enroll({ userId: USERS.moussa }, { pid: PROJECTS.a2 })).status).toBe(201);
      } finally {
        await f.h.superuser('UPDATE plans SET max_subscribers = 100 WHERE id = $1', [PLANS.essentiel]);
      }
    });

    it('téléphone au format E.164 mais invalide : 422 invalid_phone', async () => {
      const res = await enroll(newMember('+2250000000000'));
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'invalid_phone', fields: { phone: 'invalid_phone' } });
    });

    it.each([
      ['avant le début du projet', PROJECTS.a, '2026-02-28', 'before_project_start'],
      ['après la dernière échéance (dates fixes)', PROJECTS.a, '2027-08-06', 'no_installment'],
      ['hors des années prises en charge (cycle roulant)', PROJECTS.rollingA, '2200-01-01', 'invalid_date'],
    ])('date d’entrée %s : 422 validation_failed sur startsFrom', async (_label, pid, startsFrom, problem) => {
      const res = await enroll(newMember(NEW.kofi, { startsFrom }), { pid });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'validation_failed', fields: { startsFrom: problem } });
      expect(await usersWithPhone(NEW.kofi)).toEqual([]);
    });

    it('sans Idempotency-Key : 422 validation_failed, rien n’est écrit', async () => {
      const res = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/enrollments`, {
        token: f.tokens.awa,
        method: 'POST',
        body: newMember(NEW.kofi),
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'validation_failed', fields: { 'Idempotency-Key': 'required' } });
      expect(await usersWithPhone(NEW.kofi)).toEqual([]);
    });
  });

  describe('isolation et droits', () => {
    it('projet d’une autre association : 404, aucun compte créé', async () => {
      const res = await enroll(newMember(NEW.kofi), { pid: PROJECTS.b });
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
      expect(await usersWithPhone(NEW.kofi)).toEqual([]);
    });

    it('autre association dans l’URL : 404 (Aminata sans lien avec B, Awa seulement souscriptrice de B)', async () => {
      for (const token of [f.tokens.aminata, f.tokens.awa]) {
        const res = await enroll(newMember(NEW.kofi), { aid: B.id, pid: PROJECTS.b, token });
        expect(res.status).toBe(404);
      }
      expect(await usersWithPhone(NEW.kofi)).toEqual([]);
    });

    it('manager : autorisé ; viewer : 403 ; jeton souscripteur : 404', async () => {
      expect((await enroll(newMember(NEW.kofi), { token: f.tokens.aminata })).status).toBe(201);
      const viewer = await enroll(newMember(NEW.ama), { token: f.tokens.koffi });
      expect(viewer.status).toBe(403);
      expect((await enroll(newMember(NEW.ama), { token: f.tokens.moussa })).status).toBe(404);
      expect(await usersWithPhone(NEW.ama)).toEqual([]);
    });
  });

  describe('idempotence', () => {
    it('même clé, même corps : même réponse (même code), une seule inscription, un seul audit', async () => {
      const since = await dbNow();
      const key = crypto.randomUUID();
      const body = newMember(NEW.kofi, { startsFrom: '2026-11-01' });
      const first = await created(body, { key });
      const again = await created(body, { key });
      expect(again).toEqual(first);
      expect(await usersWithPhone(NEW.kofi)).toHaveLength(1);
      const counts = await f.h.superuser(
        `SELECT (SELECT count(*)::int FROM enrollments) AS enrollments,
                (SELECT count(*)::int FROM audit_logs WHERE action = 'enrollment.create' AND occurred_at >= $1) AS audits,
                (SELECT count(*)::int FROM outbox_events
                  WHERE event_type = 'member.enrolled' AND occurred_at >= $1) AS events`,
        [since],
      );
      expect(counts.rows).toEqual([{ enrollments: 1, audits: 1, events: 1 }]);
    });

    it('rejeu d’un compte existant actif : toujours sans code', async () => {
      const key = crypto.randomUUID();
      const first = await created({ userId: USERS.fatou }, { key });
      expect(await created({ userId: USERS.fatou }, { key })).toEqual(first);
    });

    it('même clé, autre corps : 422 idempotency_key_reused', async () => {
      const key = crypto.randomUUID();
      await created(newMember(NEW.kofi), { key });
      const res = await enroll(newMember(NEW.ama), { key });
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('idempotency_key_reused');
    });
  });

  describe('concurrence : le même numéro ne crée jamais deux comptes', () => {
    it('même projet, deux requêtes simultanées : une inscription, l’autre already_enrolled', async () => {
      const results = await Promise.all([enroll(newMember(NEW.kofi)), enroll(newMember(NEW.kofi))]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const refused = results.find((r) => r.status === 409);
      expect(refused && (await codeOf(refused))).toBe('already_enrolled');
      expect(await usersWithPhone(NEW.kofi)).toHaveLength(1);
    });

    it('deux projets de l’association, simultanément : deux inscriptions, un compte, une appartenance', async () => {
      const results = await Promise.all([
        enroll(newMember(NEW.kofi)),
        enroll(newMember(NEW.kofi), { pid: PROJECTS.a2, token: f.tokens.aminata }),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      const users = await usersWithPhone(NEW.kofi);
      expect(users).toHaveLength(1);
      expect(await subscriberMemberships(A.id, users[0]?.id ?? '')).toHaveLength(1);
    });

    it('même compte par son identifiant, deux projets, simultanément : une appartenance rétablie', async () => {
      const results = await Promise.all([
        enroll({ userId: USERS.fatou }),
        enroll({ userId: USERS.fatou }, { pid: PROJECTS.a2, token: f.tokens.aminata }),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      expect(await subscriberMemberships(A.id, USERS.fatou)).toMatchObject([{ status: 'active' }]);
    });

    it('deux associations, simultanément : un compte, une inscription dans chacune, un seul code', async () => {
      const results = await Promise.all([
        enroll(newMember(NEW.yao)),
        enroll(newMember(NEW.yao), { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi }),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      const users = await usersWithPhone(NEW.yao);
      expect(users).toHaveLength(1);
      const enrollments = await f.h.superuser(
        'SELECT association_id FROM enrollments WHERE user_id = $1 ORDER BY association_id',
        [users[0]?.id],
      );
      expect(enrollments.rows).toEqual([{ association_id: A.id }, { association_id: B.id }]);
      // Seule l'association qui a créé le compte remet un code.
      const handoffs = await Promise.all(results.map(async (r) => Created.parse(await r.json()).handoff));
      expect(handoffs.filter((h) => h !== null)).toHaveLength(1);
      expect(await activationCodes(users[0]?.id ?? '')).toMatchObject([{ live: true }]);
    });

    it('cinq requêtes simultanées, même numéro, même projet : un compte, une inscription', async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => enroll(newMember(NEW.ama))));
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
      expect(await usersWithPhone(NEW.ama)).toHaveLength(1);
    });
  });
});
