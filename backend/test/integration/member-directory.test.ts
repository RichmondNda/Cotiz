import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf } from './platform-associations.fixture.js';
import { type MembersFixture, PHONES, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Lot 2.3 · étape 6 : annuaire (mb.list), fiche (mb.get), modification (mb.patch, Q7) et frise (mb.timeline). Choix de
 * l'étape : l'annuaire d'une association = les personnes inscrites à au moins un de ses projets (retirées comprises) ;
 * situation par @cotiz/domain (overallStanding : le pire de ses projets) ; frise = actions de l'association tirées de
 * son audit ; email déjà pris en modification : 422 (`email: taken`).
 *
 * Horloge : Date figée (puis qui avance) au 2026-11-08 10:00 UTC (voir enrollment-list-withdraw.test.ts).
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Created = ENDPOINTS['en.create'].operations.create.response.body;
const Members = ENDPOINTS['mb.list'].operations.list.response.body;
const Detail = ENDPOINTS['mb.get'].operations.get.response.body;
const Timeline = ENDPOINTS['mb.timeline'].operations.list.response.body;
const NEW = { kofi: '+2250711223344', ama: '+2250722334455', other: '+2250733445566' } as const;

describe('annuaire et fiche (mb.list, mb.get, mb.patch, mb.timeline)', () => {
  let f: MembersFixture;

  const enroll = async (body: unknown, options: { aid?: string; pid?: string; token?: string } = {}) => {
    const res = await f.call(`/associations/${options.aid ?? A.id}/projects/${options.pid ?? PROJECTS.a}/enrollments`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.status).toBe(201);
    return Created.parse(await res.json()).enrollment;
  };
  const get = (path: string, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/members${path}`, { token: options.token ?? f.tokens.awa });
  const members = async (query = '', options: { aid?: string; token?: string } = {}) => {
    const res = await get(query, options);
    expect(res.status).toBe(200);
    return Members.parse(await res.json());
  };
  const detail = async (uid: string, options: { aid?: string; token?: string } = {}) => {
    const res = await get(`/${uid}`, options);
    expect(res.status).toBe(200);
    return Detail.parse(await res.json());
  };
  const patch = (uid: string, body: unknown, version: number | null, options: { token?: string } = {}) =>
    f.call(`/associations/${A.id}/members/${uid}`, {
      token: options.token ?? f.tokens.awa,
      method: 'PATCH',
      body,
      headers: version === null ? {} : { 'if-match': `W/"${String(version)}"` },
    });
  const timeline = async (uid: string, query = '', options: { aid?: string; token?: string } = {}) => {
    const res = await get(`/${uid}/timeline${query}`, options);
    expect(res.status).toBe(200);
    return Timeline.parse(await res.json());
  };
  const dbNow = async () => ((await f.h.superuser('SELECT clock_timestamp() AS t')).rows as [{ t: Date }])[0].t;

  /**
   * Kofi (créé par A, non activé) : en retard sur PROJECTS.a, entré aujourd'hui sur PROJECTS.a2. Moussa (actif) : à
   * jour sur PROJECTS.a2. Ama (créée par A, non activée) : à jour sur PROJECTS.a. Fatou : inscrite chez B seulement.
   */
  const scenario = async () => {
    const kofiLate = await enroll({
      phone: NEW.kofi,
      firstName: 'Kofi',
      lastName: 'Annan',
      address: 'Rue 12, Cocody',
      startsFrom: '2026-03-01',
    });
    const kofi = kofiLate.member.id;
    const kofiToday = await enroll({ userId: kofi }, { pid: PROJECTS.a2 });
    const moussa = await enroll({ userId: USERS.moussa, startsFrom: '2026-11-01' }, { pid: PROJECTS.a2 });
    await f.h.superuser(
      `UPDATE installments SET amount_paid = amount_due WHERE enrollment_id = $1 AND due_date = '2026-11-05'`,
      [moussa.id],
    );
    const ama = (await enroll({ phone: NEW.ama, firstName: 'Ama', lastName: 'Kouassi' })).member.id;
    await enroll({ userId: USERS.fatou }, { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi });
    return { kofi, kofiLate, kofiToday, ama };
  };

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

  describe('mb.list', () => {
    it('inscrits de l’association seulement, projets, totaux et situation globale (le pire de ses projets)', async () => {
      const { kofi, ama } = await scenario();
      const page = await members();
      expect(page.total).toBe(3);
      const byId = new Map(page.items.map((m) => [m.member.id, m]));
      expect([...byId.keys()].sort()).toEqual([kofi, ama, USERS.moussa].sort());
      expect(byId.get(kofi)).toMatchObject({
        member: { firstName: 'Kofi', lastName: 'Annan', phone: NEW.kofi },
        standing: 'late',
        totalPaid: { amount: 0, currency: 'XOF' },
      });
      expect(
        byId
          .get(kofi)
          ?.projects.map((p) => p.id)
          .sort(),
      ).toEqual([PROJECTS.a, PROJECTS.a2].sort());
      expect(byId.get(USERS.moussa)).toMatchObject({ standing: 'up_to_date', totalPaid: { amount: 25_000 } });
      expect(byId.get(ama)).toMatchObject({ standing: 'activation_pending' });
      expect(page.facets).toEqual({
        standing: { late: 1, up_to_date: 1, activation_pending: 1, signature_required: 0, withdrawn: 0 },
      });
    });

    it('filtres projet, situation et recherche ; pages par curseur (membres les plus récents d’abord)', async () => {
      const { kofi, ama } = await scenario();
      expect((await members(`?projectId=${PROJECTS.a2}`)).items.map((m) => m.member.id).sort()).toEqual(
        [kofi, USERS.moussa].sort(),
      );
      expect((await members('?standing=late')).items.map((m) => m.member.id)).toEqual([kofi]);
      expect((await members('?q=kouassi')).items.map((m) => m.member.id)).toEqual([ama]);
      expect((await members(`?q=${encodeURIComponent('44218790')}`)).items.map((m) => m.member.id)).toEqual([
        USERS.moussa,
      ]);
      const one = await members('?limit=2');
      expect(one.items.map((m) => m.member.id)).toEqual([ama, USERS.moussa]);
      const two = await members(`?limit=2&cursor=${one.nextCursor ?? ''}`);
      expect(two.items.map((m) => m.member.id)).toEqual([kofi]);
      expect(two.nextCursor).toBeNull();
    });

    it('retiré de tous ses projets : toujours dans l’annuaire, situation withdrawn', async () => {
      const { ama } = await scenario();
      const [enrollment] = (await f.h.superuser('SELECT id FROM enrollments WHERE user_id = $1', [ama])).rows as {
        id: string;
      }[];
      const res = await f.call(`/associations/${A.id}/enrollments/${enrollment?.id ?? ''}/withdraw`, {
        token: f.tokens.awa,
        method: 'POST',
        body: {},
      });
      expect(res.status).toBe(200);
      expect((await members('?standing=withdrawn')).items.map((m) => m.member.id)).toEqual([ama]);
    });

    it('lecteur autorisé ; B ne voit que ses inscrits', async () => {
      await scenario();
      expect((await get('', { token: f.tokens.koffi })).status).toBe(200);
      expect((await members('', { aid: B.id, token: f.tokens.koffi })).items.map((m) => m.member.id)).toEqual([
        USERS.fatou,
      ]);
    });
  });

  describe('mb.get', () => {
    it('fiche : profil, membre depuis la première inscription, inscriptions et échéances calculées, version', async () => {
      const { kofi, kofiLate, kofiToday } = await scenario();
      const body = await detail(kofi);
      expect(body.member).toEqual({
        id: kofi,
        firstName: 'Kofi',
        lastName: 'Annan',
        phone: NEW.kofi,
        email: null,
        address: 'Rue 12, Cocody',
        city: null,
        accountStatus: 'pending_activation',
      });
      expect(body.memberSince).toBe(kofiLate.joinedAt);
      expect(body.standing).toBe('late');
      expect(body.version).toBe(1);
      expect(body.enrollments.map((e) => e.id).sort()).toEqual([kofiLate.id, kofiToday.id].sort());
      const late = body.enrollments.find((e) => e.id === kofiLate.id);
      expect(late?.project).toEqual({ id: PROJECTS.a, name: 'Centre communautaire' });
      expect(late?.installments).toHaveLength(18);
      expect(late?.installments[0]).toMatchObject({
        sequence: 1,
        dueDate: '2026-03-05',
        status: 'late',
        lateSince: '2026-03-11',
        amountDue: { amount: 25_000, currency: 'XOF' },
        remaining: { amount: 25_000, currency: 'XOF' },
        paidAt: null,
      });
      expect(late?.installments[8]).toMatchObject({ dueDate: '2026-11-05', status: 'due' });
    });

    it('personne non inscrite chez A (même souscriptrice de A), d’une autre association ou inconnue : 404', async () => {
      await scenario();
      for (const uid of [USERS.awa, USERS.fatou, '00000000-0000-7000-8000-0000000000ff']) {
        const res = await get(`/${uid}`);
        expect(res.status).toBe(404);
        expect(await codeOf(res)).toBe('not_found');
      }
    });
  });

  describe('mb.patch', () => {
    it('compte non activé créé par A : identité modifiable ; version, événement, audit sans téléphone en clair', async () => {
      const { kofi } = await scenario();
      const since = await dbNow();
      const res = await patch(
        kofi,
        { firstName: 'Kofi A.', phone: NEW.other, email: 'kofi@exemple.ci', city: 'Abidjan' },
        1,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"2"');
      const body = Detail.parse(await res.json());
      expect(body.version).toBe(2);
      expect(body.member).toMatchObject({
        firstName: 'Kofi A.',
        phone: NEW.other,
        email: 'kofi@exemple.ci',
        city: 'Abidjan',
        address: 'Rue 12, Cocody',
      });
      const events = await f.h.superuser(
        `SELECT payload FROM outbox_events WHERE event_type = 'member.updated' AND occurred_at >= $1`,
        [since],
      );
      expect(events.rows).toEqual([
        { payload: { userId: kofi, changedFields: ['firstName', 'phone', 'email', 'city'] } },
      ]);
      const audit = await f.h.superuser(
        `SELECT entity_type, entity_id, before, after FROM audit_logs WHERE action = 'member.update' AND occurred_at >= $1`,
        [since],
      );
      expect(audit.rows).toMatchObject([{ entity_type: 'user', entity_id: kofi }]);
      const text = JSON.stringify(audit.rows);
      expect(text).not.toContain(NEW.other);
      expect(text).not.toContain(NEW.kofi);
    });

    it('version périmée : 412 ; If-Match absent : 422 ; corps vide : 422', async () => {
      const { kofi } = await scenario();
      const stale = await patch(kofi, { city: 'Abidjan' }, 7);
      expect(stale.status).toBe(412);
      expect(await codeOf(stale)).toBe('version_conflict');
      expect((await patch(kofi, { city: 'Abidjan' }, null)).status).toBe(422);
      expect((await patch(kofi, {}, 1)).status).toBe(422);
    });

    it('compte activé ou créé ailleurs : identité refusée (409 invalid_state), adresse et ville acceptées', async () => {
      await scenario();
      const created = await enroll(
        { phone: NEW.other, firstName: 'Yao', lastName: 'Bé' },
        { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
      );
      await enroll({ userId: created.member.id });
      for (const uid of [USERS.moussa, created.member.id]) {
        const refused = await patch(uid, { firstName: 'Autre' }, 1);
        expect(refused.status).toBe(409);
        expect(await codeOf(refused)).toBe('invalid_state');
        const accepted = await patch(uid, { city: 'Bouaké', address: 'Quartier Commerce' }, 1);
        expect(accepted.status).toBe(200);
        expect(Detail.parse(await accepted.json()).member).toMatchObject({ city: 'Bouaké' });
      }
    });

    it('téléphone pris : 409 phone_taken ; téléphone invalide : 422 ; email pris : 422 (email: taken)', async () => {
      const { kofi, ama } = await scenario();
      const taken = await patch(kofi, { phone: PHONES.moussa }, 1);
      expect(taken.status).toBe(409);
      expect(await codeOf(taken)).toBe('phone_taken');
      const invalid = await patch(kofi, { phone: '+2250000000000' }, 1);
      expect(invalid.status).toBe(422);
      expect(await invalid.json()).toMatchObject({ code: 'validation_failed', fields: { phone: 'invalid_phone' } });
      expect((await patch(ama, { email: 'ama@exemple.ci' }, 1)).status).toBe(200);
      const email = await patch(kofi, { email: 'AMA@exemple.ci' }, 1);
      expect(email.status).toBe(422);
      expect(await email.json()).toMatchObject({ code: 'validation_failed', fields: { email: 'taken' } });
      expect((await detail(kofi)).version).toBe(1);
    });

    it('lecteur : 403 ; personne non inscrite chez A : 404', async () => {
      const { kofi } = await scenario();
      expect((await patch(kofi, { city: 'Abidjan' }, 1, { token: f.tokens.koffi })).status).toBe(403);
      expect((await patch(USERS.fatou, { city: 'Abidjan' }, 1)).status).toBe(404);
    });
  });

  describe('mb.timeline', () => {
    it('actions de l’association sur la personne, des plus récentes aux plus anciennes ; recherches exclues', async () => {
      const lookup = await f.call(`/associations/${A.id}/members/lookup`, {
        token: f.tokens.awa,
        method: 'POST',
        body: { phone: NEW.kofi, projectId: PROJECTS.a },
      });
      expect(lookup.status).toBe(200);
      const { kofi, kofiLate } = await scenario();
      const resent = await f.call(`/associations/${A.id}/members/${kofi}/activation-code`, {
        token: f.tokens.awa,
        method: 'POST',
      });
      expect(resent.status).toBe(200);
      const codes = await f.call(`/associations/${A.id}/activation-codes`, { token: f.tokens.awa });
      const [code] = ENDPOINTS['mb.codes'].operations.list.response.body
        .parse(await codes.json())
        .items.filter((e) => e.member.id === kofi);
      expect(
        (
          await f.call(`/associations/${A.id}/activation-codes/${code?.id ?? ''}/handed`, {
            token: f.tokens.awa,
            method: 'POST',
          })
        ).status,
      ).toBe(200);
      expect((await patch(kofi, { city: 'Abidjan' }, 1)).status).toBe(200);
      expect(
        (
          await f.call(`/associations/${A.id}/enrollments/${kofiLate.id}/withdraw`, {
            token: f.tokens.awa,
            method: 'POST',
            body: { reason: 'Déménagement' },
          })
        ).status,
      ).toBe(200);

      const page = await timeline(kofi);
      expect(page.items.map((e) => e.type)).toEqual([
        'withdrawn',
        'profile_updated',
        'activation_code_handed',
        'activation_code_issued',
        'enrolled',
        'enrolled',
      ]);
      expect(page.total).toBe(6);
      expect(page.items[0]).toMatchObject({
        title: 'Retrait du projet',
        detail: 'Déménagement',
        tone: 'warning',
        project: { id: PROJECTS.a, name: 'Centre communautaire' },
      });
      expect(page.items.at(-1)).toMatchObject({
        title: 'Inscription au projet',
        tone: 'brand',
        project: { id: PROJECTS.a, name: 'Centre communautaire' },
      });
      const one = await timeline(kofi, '?limit=4');
      const two = await timeline(kofi, `?limit=4&cursor=${one.nextCursor ?? ''}`);
      expect([...one.items, ...two.items].map((e) => e.id)).toEqual(page.items.map((e) => e.id));
    });

    it('les actions d’une autre association sur la même personne n’y figurent pas', async () => {
      const created = await enroll(
        { phone: NEW.other, firstName: 'Yao', lastName: 'Bé' },
        { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
      );
      await enroll({ userId: created.member.id });
      const page = await timeline(created.member.id);
      expect(page.items.map((e) => [e.type, e.project?.id])).toEqual([['enrolled', PROJECTS.a]]);
      const theirs = await timeline(created.member.id, '', { aid: B.id, token: f.tokens.koffi });
      expect(theirs.items.map((e) => [e.type, e.project?.id])).toEqual([['enrolled', PROJECTS.b]]);
    });

    it('personne non inscrite chez A : 404 ; lecteur autorisé', async () => {
      const { kofi } = await scenario();
      expect((await get(`/${USERS.fatou}/timeline`)).status).toBe(404);
      expect((await get(`/${kofi}/timeline`, { token: f.tokens.koffi })).status).toBe(200);
    });
  });
});
