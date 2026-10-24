import { PlatformAssociationDetail } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B } from '../isolation/harness.js';
import { codeOf, D, type PlatformFixture, STAFF, startPlatformFixture, SUBS } from './platform-associations.fixture.js';

/**
 * Lot 1.4 · étape 2 : modification administrative d'une association (pf.asso.patch) par le super-admin, sous verrou
 * optimiste (`If-Match`). Vérification de l'étape : `version_conflict` testé. Auditée, événement association.updated
 * (champs modifiés), surcharge des comptes gestionnaires portée par l'abonnement en cours.
 */

describe('modification d’une association (pf.asso.patch)', () => {
  let f: PlatformFixture;
  let owner: string;
  let support: string;

  const patch = (id: string, body: unknown, version: number | null, token = owner) =>
    f.call(`/platform/associations/${id}`, {
      token,
      method: 'PATCH',
      body,
      headers: version === null ? {} : { 'if-match': `W/"${String(version)}"` },
    });
  const row = async (id: string) =>
    (
      await f.h.superuser(
        `SELECT a.name, a.city, a.description, a.contact_phone, a.version, s.manager_seats_override
           FROM associations a JOIN subscriptions s ON s.association_id = a.id WHERE a.id = $1`,
        [id],
      )
    ).rows[0] as Record<string, unknown>;
  const events = async (id: string) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, payload FROM outbox_events
          WHERE event_type = 'association.updated' AND aggregate_id = $1 ORDER BY id`,
        [id],
      )
    ).rows as { association_id: string; actor_user_id: string; payload: unknown }[];
  /** Journal en ajout seul : les entrées de ce test, après l'horodatage donné. */
  const audits = async (id: string, since: Date) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, before, after FROM audit_logs
          WHERE action = 'association.update' AND entity_id = $1 AND occurred_at >= $2 ORDER BY id`,
        [id, since],
      )
    ).rows as Record<string, unknown>[];

  beforeAll(async () => {
    f = await startPlatformFixture();
    owner = await f.login('platform', STAFF.owner.email);
    support = await f.login('platform', STAFF.support.email);
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.h.superuser(
      `UPDATE associations SET name = 'Entraide Yopougon', city = 'Abidjan', description = NULL,
         contact_phone = '+2250700000000', version = 1 WHERE id = $1`,
      [A.id],
    );
    await f.h.superuser('UPDATE subscriptions SET manager_seats_override = NULL WHERE id = $1', [SUBS.a]);
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type = 'association.updated'`);
  });

  it('seuls les champs envoyés changent ; version incrémentée, ETag, fiche à jour', async () => {
    const res = await patch(A.id, { city: 'Yopougon', description: 'Entraide des familles' }, 1);
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('W/"2"');
    const detail = PlatformAssociationDetail.parse(await res.json());
    expect(detail).toMatchObject({
      name: 'Entraide Yopougon',
      city: 'Yopougon',
      description: 'Entraide des familles',
      version: 2,
    });
    expect(await row(A.id)).toMatchObject({ name: 'Entraide Yopougon', city: 'Yopougon', version: 2 });
  });

  it('événement association.updated : champs réellement modifiés, association et auteur', async () => {
    await patch(A.id, { name: 'Entraide Yopougon', city: 'Yopougon', contactPhone: '+2250708091011' }, 1);
    expect(await events(A.id)).toEqual([
      {
        association_id: A.id,
        actor_user_id: STAFF.owner.id,
        payload: { associationId: A.id, changedFields: ['city', 'contactPhone'] },
      },
    ]);
  });

  it('audité : avant et après des champs modifiés, téléphone masqué', async () => {
    const since = new Date();
    await patch(A.id, { city: 'Yopougon', contactPhone: '+2250708091011' }, 1);
    const [entry, ...others] = await audits(A.id, since);
    expect(others).toEqual([]);
    // Seuls les champs modifiés, jamais tout le profil.
    expect(entry).toEqual({
      association_id: A.id,
      actor_user_id: STAFF.owner.id,
      before: { city: 'Abidjan', contactPhone: '+225 07 •• •• •• 00' },
      after: { city: 'Yopougon', contactPhone: '+225 07 •• •• •• 11' },
    });
  });

  it('frise de la fiche : la modification y figure, avec son auteur', async () => {
    await patch(A.id, { city: 'Yopougon' }, 1);
    const detail = PlatformAssociationDetail.parse(
      await (await f.call(`/platform/associations/${A.id}`, { token: support })).json(),
    );
    expect(detail.events[0]).toMatchObject({
      type: 'association.updated',
      by: { id: STAFF.owner.id, firstName: 'Richy' },
    });
    expect(detail.events.at(-1)).toMatchObject({ type: 'association.created' });
  });

  it('version périmée : 412 version_conflict, rien n’est modifié, ni événement', async () => {
    expect((await patch(A.id, { city: 'Yopougon' }, 1)).status).toBe(200);
    const res = await patch(A.id, { city: 'Cocody' }, 1);
    expect(res.status).toBe(412);
    expect(await codeOf(res)).toBe('version_conflict');
    expect(await row(A.id)).toMatchObject({ city: 'Yopougon', version: 2 });
    expect(await events(A.id)).toHaveLength(1);
  });

  it('version périmée sur la seule surcharge des comptes : 412, abonnement inchangé', async () => {
    expect((await patch(A.id, { city: 'Yopougon' }, 1)).status).toBe(200);
    const res = await patch(A.id, { managerSeatsOverride: 4 }, 1);
    expect(res.status).toBe(412);
    expect(await row(A.id)).toMatchObject({ manager_seats_override: null, version: 2 });
  });

  it('If-Match absent : 422 ; corps vide : 422 ; rien n’est modifié', async () => {
    expect((await patch(A.id, { city: 'Yopougon' }, null)).status).toBe(422);
    const res = await patch(A.id, {}, 1);
    expect(res.status).toBe(422);
    expect(await codeOf(res)).toBe('validation_failed');
    expect(await row(A.id)).toMatchObject({ city: 'Abidjan', version: 1 });
    expect(await events(A.id)).toEqual([]);
  });

  it('champ invalide : 422 sur le champ', async () => {
    const res = await patch(A.id, { contactEmail: 'pas-un-email' }, 1);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; fields?: Record<string, unknown> };
    expect(body.code).toBe('validation_failed');
    expect(body.fields).toHaveProperty('contactEmail');
  });

  describe('comptes gestionnaires autorisés (surcharge du plan, portée par l’abonnement en cours)', () => {
    it('surcharge posée : limite des quotas de la fiche, abonnement à jour', async () => {
      const res = await patch(A.id, { managerSeatsOverride: 4 }, 1);
      expect(res.status).toBe(200);
      const detail = PlatformAssociationDetail.parse(await res.json());
      expect(detail.subscription.managerSeatsOverride).toBe(4);
      expect(detail.quotas.managers).toEqual({ used: 1, limit: 4 });
      expect(await row(A.id)).toMatchObject({ manager_seats_override: 4, version: 2 });
      expect(await events(A.id)).toMatchObject([{ payload: { changedFields: ['managerSeatsOverride'] } }]);
    });

    it('égale au plan ou null : aucune surcharge (domain-rules § 10)', async () => {
      await patch(A.id, { managerSeatsOverride: 4 }, 1);
      expect((await patch(A.id, { managerSeatsOverride: 2 }, 2)).status).toBe(200);
      expect(await row(A.id)).toMatchObject({ manager_seats_override: null });
      await patch(A.id, { managerSeatsOverride: 4 }, 3);
      expect((await patch(A.id, { managerSeatsOverride: null }, 4)).status).toBe(200);
      expect(await row(A.id)).toMatchObject({ manager_seats_override: null });
    });

    it('sans abonnement en cours : 422 sur le champ, et rien du profil ni de la version n’est gardé', async () => {
      await f.h.superuser(`UPDATE subscriptions SET status = 'canceled' WHERE id = $1`, [SUBS.d]);
      try {
        const res = await patch(D, { city: 'Korhogo', managerSeatsOverride: 3 }, 1);
        expect(res.status).toBe(422);
        expect(await res.json()).toMatchObject({ fields: { managerSeatsOverride: 'no_current_subscription' } });
        const { rows } = await f.h.superuser('SELECT city, version FROM associations WHERE id = $1', [D]);
        expect(rows[0]).toEqual({ city: 'Bouaké', version: 1 });
      } finally {
        await f.h.superuser(`UPDATE subscriptions SET status = 'trialing' WHERE id = $1`, [SUBS.d]);
      }
    });

    it('surcharge d’une association : celle d’une autre association est intacte', async () => {
      await patch(A.id, { managerSeatsOverride: 4 }, 1);
      const { rows } = await f.h.superuser('SELECT manager_seats_override FROM subscriptions WHERE id = $1', [SUBS.b]);
      expect(rows[0]).toEqual({ manager_seats_override: 3 });
    });

    it('même valeur qu’avant : version incrémentée, aucun champ modifié, aucun événement', async () => {
      expect((await patch(A.id, { managerSeatsOverride: null, city: 'Abidjan' }, 1)).status).toBe(200);
      expect(await row(A.id)).toMatchObject({ version: 2 });
      expect(await events(A.id)).toEqual([]);
    });
  });

  describe('permissions (platform.associations.manage)', () => {
    it('support : 403 forbidden, rien n’est modifié', async () => {
      const res = await patch(A.id, { city: 'Yopougon' }, 1, support);
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('forbidden');
      expect(await row(A.id)).toMatchObject({ city: 'Abidjan', version: 1 });
    });

    it('sans jeton : 401 ; jeton gestionnaire ou souscripteur : 404 (espace plateforme)', async () => {
      expect((await patch(A.id, { city: 'Yopougon' }, 1, '')).status).toBe(401);
      for (const token of [
        await f.login('association', 'koffi@test.cotiz.app'),
        await f.login('subscriber', 'moussa@test.cotiz.app'),
      ]) {
        expect((await patch(A.id, { city: 'Yopougon' }, 1, token)).status).toBe(404);
      }
      expect(await row(A.id)).toMatchObject({ city: 'Abidjan', version: 1 });
    });

    it('association inconnue : 404 not_found', async () => {
      const res = await patch('00000000-0000-7000-8000-0000000015ff', { city: 'Yopougon' }, 1);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    });

    it('B intacte après toutes ces modifications', async () => {
      await patch(A.id, { city: 'Yopougon' }, 1);
      const { rows } = await f.h.superuser('SELECT city, version FROM associations WHERE id = $1', [B.id]);
      expect(rows[0]).toEqual({ city: 'Abidjan', version: 1 });
    });
  });
});
