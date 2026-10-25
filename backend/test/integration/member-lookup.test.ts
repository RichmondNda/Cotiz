import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, STAFF } from './platform-associations.fixture.js';
import { type MembersFixture, PHONES, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Lot 2.3 · étape 2 : recherche par téléphone avant l'ajout d'un souscripteur (mb.lookup, architecture/04 § 4.3).
 * Trois réponses : `new`, `existing_user` (prénom et initiale du nom seulement, nombre d'associations sans détail :
 * Q10), `already_enrolled`. Téléphone revalidé par libphonenumber-js (Q4) : `invalid_phone`. Limité en débit par
 * personne et audité (téléphone masqué) : l'endpoint ne doit pas servir d'annuaire.
 */

const LookupResult = ENDPOINTS['mb.lookup'].operations.lookup.response.body;

/** Plafond par personne et par endpoint de ce fichier : le test de débit le dépasse avec Aminata seule. */
const LIMIT = 15;

describe('recherche par téléphone (mb.lookup)', () => {
  let f: MembersFixture;

  const lookup = (body: unknown, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/members/lookup`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
    });
  const found = async (phone: string, projectId: string = PROJECTS.a) => {
    const res = await lookup({ phone, projectId });
    expect(res.status).toBe(200);
    return LookupResult.parse(await res.json());
  };

  beforeAll(async () => {
    f = await startMembersFixture({ RATE_LIMIT_ENDPOINT_PER_MIN: String(LIMIT) });
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.resetMembers();
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
  });

  describe('les trois réponses', () => {
    it('numéro inconnu : new, rien d’autre', async () => {
      const res = await lookup({ phone: PHONES.unknown, projectId: PROJECTS.a });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ result: 'new' });
    });

    it('compte existant : prénom et initiale du nom seulement, associations non retirées comptées sans détail', async () => {
      // Fatou : souscriptrice de B, retirée de A (non comptée).
      const res = await lookup({ phone: PHONES.fatou, projectId: PROJECTS.a });
      expect(res.status).toBe(200);
      const body: unknown = await res.json();
      expect(body).toEqual({
        result: 'existing_user',
        person: { id: USERS.fatou, firstName: 'Fatou', lastInitial: 'T' },
        associationsCount: 1,
      });
      // Ni nom complet, ni téléphone, ni email, ni nom d'association dans la réponse.
      const text = JSON.stringify(body);
      for (const leak of ['Traoré', PHONES.fatou, '@', 'Ressortissants', B.id]) expect(text).not.toContain(leak);
    });

    it('associations comptées quel que soit le rôle : Awa, owner de A et souscriptrice de B, vue depuis B', async () => {
      const res = await lookup({ phone: PHONES.awa, projectId: PROJECTS.b }, { aid: B.id, token: f.tokens.koffi });
      expect(LookupResult.parse(await res.json())).toEqual({
        result: 'existing_user',
        person: { id: USERS.awa, firstName: 'Awa', lastInitial: 'K' },
        associationsCount: 2,
      });
    });

    it('compte sans aucune appartenance (personnel de la plateforme) : existing_user, 0 association', async () => {
      await f.h.superuser('UPDATE users SET phone_e164 = $1 WHERE id = $2', ['+2250101010101', STAFF.owner.id]);
      try {
        expect(await found('+2250101010101')).toEqual({
          result: 'existing_user',
          person: { id: STAFF.owner.id, firstName: 'Richy', lastInitial: 'N' },
          associationsCount: 0,
        });
      } finally {
        await f.h.superuser('UPDATE users SET phone_e164 = NULL WHERE id = $1', [STAFF.owner.id]);
      }
    });

    it('déjà inscrit à ce projet : already_enrolled, même retiré (une seule inscription par projet)', async () => {
      const enrollment = await f.enroll(PROJECTS.a, USERS.moussa);
      const enrolled = {
        result: 'already_enrolled',
        person: { id: USERS.moussa, firstName: 'Moussa', lastInitial: 'D' },
      };
      expect(await found(PHONES.moussa)).toEqual(enrolled);
      await f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [
        enrollment,
      ]);
      expect(await found(PHONES.moussa)).toEqual(enrolled);
    });

    it('inscrit à un autre projet de l’association : existing_user pour celui-ci', async () => {
      await f.enroll(PROJECTS.a, USERS.moussa);
      expect(await found(PHONES.moussa, PROJECTS.a2)).toMatchObject({ result: 'existing_user', associationsCount: 1 });
    });

    it('inscription à un projet d’une autre association : sans effet ici (Fatou inscrite au projet de B)', async () => {
      await f.enroll(PROJECTS.b, USERS.fatou, B.id);
      expect(await found(PHONES.fatou)).toMatchObject({ result: 'existing_user' });
    });

    it('numéro d’un autre pays, valide : recherché tel quel (E.164)', async () => {
      expect(await found('+33612345678')).toEqual({ result: 'new' });
    });
  });

  describe('téléphone', () => {
    it.each(['+2250000000000', '+2250100', '+999123456789'])(
      'au format E.164 mais invalide (%s) : 422 invalid_phone',
      async (phone) => {
        const res = await lookup({ phone, projectId: PROJECTS.a });
        expect(res.status).toBe(422);
        expect(await codeOf(res)).toBe('invalid_phone');
      },
    );

    it.each(['0708091011', '+225 07 08 09 10 11', ''])(
      'hors format E.164 (%j) : 422 validation_failed',
      async (phone) => {
        const res = await lookup({ phone, projectId: PROJECTS.a });
        expect(res.status).toBe(422);
        expect(await codeOf(res)).toBe('validation_failed');
      },
    );
  });

  describe('projet et droits', () => {
    it('projet d’une autre association, ou inconnu : même 404 pour tout numéro (existant, inconnu, invalide), rien d’audité', async () => {
      const since = new Date();
      const answers = [];
      for (const projectId of [PROJECTS.b, '00000000-0000-7000-8000-00000000c3ff']) {
        for (const phone of [PHONES.fatou, PHONES.unknown, '+2250000000000']) {
          const res = await lookup({ phone, projectId });
          answers.push({ projectId, status: res.status, body: await res.json() });
        }
      }
      expect(answers.map((a) => a.status)).toEqual(Array(6).fill(404));
      for (const a of answers) {
        expect(a.body).toMatchObject({ code: 'not_found' });
        expect(a.body).not.toHaveProperty('result');
        expect(a.body).not.toHaveProperty('person');
      }
      // Corps identiques, au champ de corrélation près (instance, requestId…).
      const strip = (body: unknown) => {
        const { code, status, title, type } = body as Record<string, unknown>;
        return { code, status, title, type };
      };
      expect(new Set(answers.map((a) => JSON.stringify(strip(a.body)))).size).toBe(1);
      const { rows } = await f.h.superuser(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'member.lookup' AND occurred_at >= $1`,
        [since],
      );
      expect(rows).toEqual([{ n: 0 }]);
    });

    it('autre association dans l’URL : 404 not_found, sans lien (Aminata) comme souscriptrice sans droit de gestion (Awa)', async () => {
      for (const token of [f.tokens.aminata, f.tokens.awa]) {
        const res = await lookup({ phone: PHONES.fatou, projectId: PROJECTS.b }, { aid: B.id, token });
        expect(res.status).toBe(404);
        const body: unknown = await res.json();
        expect(body).toMatchObject({ code: 'not_found' });
        expect(body).not.toHaveProperty('person');
      }
    });

    it('manager : autorisé ; viewer (members.manage absent) : 403', async () => {
      expect((await lookup({ phone: PHONES.unknown, projectId: PROJECTS.a }, { token: f.tokens.aminata })).status).toBe(
        200,
      );
      const res = await lookup({ phone: PHONES.unknown, projectId: PROJECTS.a }, { token: f.tokens.koffi });
      expect(res.status).toBe(403);
    });

    it('jeton souscripteur : 404, comme toute route d’association (memberships.test.ts)', async () => {
      const res = await lookup({ phone: PHONES.unknown, projectId: PROJECTS.a }, { token: f.tokens.moussa });
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    });
  });

  describe('audit et débit', () => {
    it('chaque recherche est auditée : auteur, association, résultat, personne trouvée, téléphone masqué', async () => {
      const since = new Date();
      await found(PHONES.unknown);
      await found(PHONES.fatou);
      const { rows } = await f.h.superuser(
        `SELECT actor_user_id, association_id, entity_type, entity_id, after FROM audit_logs
          WHERE action = 'member.lookup' AND occurred_at >= $1 ORDER BY occurred_at, id`,
        [since],
      );
      expect(rows).toEqual([
        {
          actor_user_id: USERS.awa,
          association_id: A.id,
          entity_type: 'user',
          entity_id: null,
          after: { result: 'new', phone: '+225 07 •• •• •• 07', projectId: PROJECTS.a },
        },
        {
          actor_user_id: USERS.awa,
          association_id: A.id,
          entity_type: 'user',
          entity_id: USERS.fatou,
          after: { result: 'existing_user', phone: '+225 01 •• •• •• 55', projectId: PROJECTS.a },
        },
      ]);
      expect(JSON.stringify(rows)).not.toContain(PHONES.fatou);
    });

    it(`au-delà de ${String(LIMIT)} recherches par minute et par personne : 429 avec Retry-After`, async () => {
      for (let i = 0; i < LIMIT; i += 1) {
        const res = await lookup({ phone: PHONES.unknown, projectId: PROJECTS.a }, { token: f.tokens.aminata });
        expect(res.status).toBe(200);
      }
      const res = await lookup({ phone: PHONES.unknown, projectId: PROJECTS.a }, { token: f.tokens.aminata });
      expect(res.status).toBe(429);
      expect(await codeOf(res)).toBe('too_many_requests');
      expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
      // Le plafond est par personne : Awa cherche encore.
      expect((await lookup({ phone: PHONES.unknown, projectId: PROJECTS.a })).status).toBe(200);
    });
  });
});
