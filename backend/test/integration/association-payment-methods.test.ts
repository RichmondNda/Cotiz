import { PaymentMethodList } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, type PlatformFixture, startPlatformFixture } from './platform-associations.fixture.js';

/**
 * Lot 2.1 · étape 2 : moyens de paiement de l'association (as.pm). GET : liste dans l'ordre ; PUT : remplacement
 * complet (mise à jour par `id`, ajout, suppression des absents), `details` validé par type. Vérification de l'étape :
 * validation par type testée. Audité (numéro masqué), association.updated si la liste change. Isolation : un `id` d'une
 * autre association est refusé, ses moyens ne sont jamais touchés.
 */

const ORANGE = {
  kind: 'mobile_money',
  label: 'Orange Money',
  details: { operator: 'orange', number: '+2250708091011' },
};
const SGBCI = {
  kind: 'bank_transfer',
  label: 'SGBCI',
  details: { bank: 'SGBCI', iban: 'CI93 CI00 8011 1234 5678 9012 34' },
  instructions: 'Indiquez votre nom en référence',
};
const CASH = { kind: 'cash', label: 'Espèces', details: {}, instructions: 'Remise au trésorier lors de la réunion' };
/** Identifiant attribué par le serveur. */
const ANY_ID: unknown = expect.any(String);
const B_METHOD = '00000000-0000-7000-8000-0000000aa0b1';

describe('moyens de paiement de l’association (as.pm)', () => {
  let f: PlatformFixture;
  /** Owner de A. */
  let awa: string;
  /** Owner de B, viewer de A. */
  let koffi: string;

  const url = (aid: string) => `/associations/${aid}/payment-methods`;
  const put = (items: unknown[], aid = A.id, token = awa) =>
    f.call(url(aid), { token, method: 'PUT', body: { items } });
  const list = async (aid = A.id, token = awa) => {
    const res = await f.call(url(aid), { token });
    expect(res.status).toBe(200);
    return PaymentMethodList.parse(await res.json()).items;
  };
  const rows = async (aid: string) =>
    (
      await f.h.superuser(
        `SELECT id, kind, label, details, instructions, position, is_active FROM association_payment_methods
          WHERE association_id = $1 ORDER BY position`,
        [aid],
      )
    ).rows as Record<string, unknown>[];
  const events = async () =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, payload FROM outbox_events
          WHERE event_type = 'association.updated' AND aggregate_id = $1 ORDER BY id`,
        [A.id],
      )
    ).rows as Record<string, unknown>[];
  const fieldsOf = async (res: Response) => ((await res.json()) as { fields?: Record<string, string> }).fields;

  beforeAll(async () => {
    f = await startPlatformFixture();
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'viewer', 'active', now())`,
      [A.id, USERS.koffi],
    );
    [awa, koffi] = await Promise.all([
      f.login('association', 'awa@test.cotiz.app'),
      f.login('association', 'koffi@test.cotiz.app'),
    ]);
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.h.superuser('DELETE FROM association_payment_methods');
    await f.h.superuser(
      `INSERT INTO association_payment_methods (id, association_id, kind, label, details, position)
       VALUES ($1, $2, 'mobile_money', 'Wave', '{"operator":"wave","number":"+2250500000001"}', 0)`,
      [B_METHOD, B.id],
    );
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type = 'association.updated'`);
  });

  it('aucun moyen : liste vide', async () => {
    expect(await list()).toEqual([]);
  });

  it('création : ordre de la liste = position, identifiants attribués, actifs par défaut', async () => {
    const res = await put([SGBCI, ORANGE, CASH]);
    expect(res.status).toBe(200);
    const items = PaymentMethodList.parse(await res.json()).items;
    expect(items).toEqual([
      { ...SGBCI, id: ANY_ID, position: 0, isActive: true },
      { ...ORANGE, id: ANY_ID, instructions: null, position: 1, isActive: true },
      { ...CASH, id: ANY_ID, position: 2, isActive: true },
    ]);
    expect(await list()).toEqual(items);
    expect(await rows(A.id)).toHaveLength(3);
  });

  it('remplacement complet : mise à jour par id, ajout, suppression des absents ; identifiants conservés', async () => {
    const [sgbci, orange] = PaymentMethodList.parse(await (await put([SGBCI, ORANGE])).json()).items;
    const updated = {
      ...ORANGE,
      id: orange?.id,
      kind: 'mobile_money',
      label: 'Wave Entraide',
      details: { operator: 'wave', number: '+2250500000099' },
      instructions: 'Référence : votre nom',
      isActive: false,
    };
    const res = await put([updated, CASH]);
    expect(res.status).toBe(200);
    const items = PaymentMethodList.parse(await res.json()).items;
    expect(items.map((m) => [m.id === orange?.id, m.label, m.position, m.isActive])).toEqual([
      [true, 'Wave Entraide', 0, false],
      [false, 'Espèces', 1, true],
    ]);
    // Relu en base : chaque champ du moyen mis à jour est écrit, pas seulement renvoyé.
    expect(await list()).toEqual(items);
    expect(await rows(A.id)).toEqual([
      {
        id: orange?.id,
        kind: 'mobile_money',
        label: 'Wave Entraide',
        details: { operator: 'wave', number: '+2250500000099' },
        instructions: 'Référence : votre nom',
        position: 0,
        is_active: false,
      },
      {
        id: items[1]?.id,
        kind: 'cash',
        label: 'Espèces',
        details: {},
        instructions: CASH.instructions,
        position: 1,
        is_active: true,
      },
    ]);
    expect((await rows(A.id)).map((r) => r.id)).not.toContain(sgbci?.id);
    // Moyens de B jamais touchés.
    expect((await rows(B.id)).map((r) => r.id)).toEqual([B_METHOD]);
  });

  it('liste vide : tous les moyens de l’association supprimés, ceux de B intacts', async () => {
    await put([SGBCI, CASH]);
    expect((await put([])).status).toBe(200);
    expect(await rows(A.id)).toEqual([]);
    expect(await rows(B.id)).toHaveLength(1);
  });

  describe('validation par type : 422 validation_failed sur le champ, rien n’est écrit', () => {
    it.each([
      [
        'mobile money, opérateur inconnu',
        { ...ORANGE, details: { operator: 'Orange', number: '+2250708091011' } },
        'items.0.details.operator',
      ],
      [
        'mobile money, numéro hors E.164',
        { ...ORANGE, details: { operator: 'orange', number: '0708091011' } },
        'items.0.details.number',
      ],
      ['mobile money, sans numéro', { ...ORANGE, details: { operator: 'mtn' } }, 'items.0.details.number'],
      ['virement, sans IBAN', { ...SGBCI, details: { bank: 'SGBCI' } }, 'items.0.details.iban'],
      ['virement, IBAN mal formé', { ...SGBCI, details: { iban: '0708091011' } }, 'items.0.details.iban'],
      ['espèces, sans instructions', { ...CASH, instructions: null }, 'items.0.instructions'],
      ['autre, sans instructions', { ...CASH, kind: 'other', instructions: ' ' }, 'items.0.instructions'],
      ['espèces avec un détail', { ...CASH, details: { iban: 'CI93 CI00 8011 1234 5678 9012 34' } }, 'items.0.details'],
      ['clé inconnue', { ...ORANGE, details: { ...ORANGE.details, pin: '1234' } }, 'items.0.details'],
    ])('%s', async (_case, method, field) => {
      await put([CASH]);
      const res = await put([method]);
      expect(res.status).toBe(422);
      expect(await codeOf(res.clone())).toBe('validation_failed');
      expect(Object.keys((await fieldsOf(res)) ?? {})).toEqual([field]);
      expect((await rows(A.id)).map((r) => r.label)).toEqual(['Espèces']);
    });

    it('plus de 20 moyens : 422', async () => {
      expect((await put(Array.from({ length: 21 }, () => CASH))).status).toBe(422);
    });
  });

  describe('identifiants', () => {
    it('id d’un moyen de B ou inconnu : 422, ni le moyen de B ni ceux de A ne changent', async () => {
      await put([CASH]);
      for (const id of [B_METHOD, '00000000-0000-7000-8000-0000000aa0ff']) {
        const res = await put([{ ...ORANGE, id }]);
        expect(res.status).toBe(422);
        expect(await fieldsOf(res)).toEqual({ 'items.0.id': 'not_found' });
      }
      expect((await rows(A.id)).map((r) => r.label)).toEqual(['Espèces']);
      expect(await rows(B.id)).toMatchObject([{ id: B_METHOD, label: 'Wave' }]);
    });

    it('même id deux fois : 422', async () => {
      const [cash] = PaymentMethodList.parse(await (await put([CASH])).json()).items;
      const res = await put([
        { ...CASH, id: cash?.id },
        { ...CASH, id: cash?.id },
      ]);
      expect(res.status).toBe(422);
      expect(await fieldsOf(res)).toEqual({ 'items.1.id': 'duplicate' });
    });
  });

  describe('événement et audit', () => {
    it('association.updated (paymentMethods) si la liste change ; liste identique : aucun événement', async () => {
      const items = PaymentMethodList.parse(await (await put([SGBCI, ORANGE])).json()).items;
      expect(await events()).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          payload: { associationId: A.id, changedFields: ['paymentMethods'] },
        },
      ]);
      expect((await put(items.map(({ position: _p, ...m }) => m))).status).toBe(200);
      expect(await events()).toHaveLength(1);
    });

    it('audité : liste avant et après, numéro mobile money masqué', async () => {
      const since = new Date();
      await put([ORANGE]);
      const { rows: audit } = await f.h.superuser(
        `SELECT association_id, actor_user_id, before, after FROM audit_logs
          WHERE action = 'association.payment_methods.replace' AND entity_id = $1 AND occurred_at >= $2`,
        [A.id, since],
      );
      expect(audit).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          before: { paymentMethods: [] },
          after: {
            paymentMethods: [
              {
                id: ANY_ID,
                kind: 'mobile_money',
                label: 'Orange Money',
                details: { operator: 'orange', phone: '+225 07 •• •• •• 11' },
                instructions: null,
                isActive: true,
              },
            ],
          },
        },
      ]);
      expect(JSON.stringify(audit)).not.toContain('0708091011');
    });
  });

  describe('droits et isolation', () => {
    it('viewer : 403 en lecture comme en écriture (association.settings.manage)', async () => {
      expect((await f.call(url(A.id), { token: koffi })).status).toBe(403);
      expect((await put([CASH], A.id, koffi)).status).toBe(403);
    });

    it('association dont on n’est pas gestionnaire : 404, rien n’est écrit', async () => {
      expect((await f.call(url(B.id), { token: awa })).status).toBe(404);
      expect((await put([], B.id, awa)).status).toBe(404);
      expect(await rows(B.id)).toHaveLength(1);
    });

    it('owner de B : ne voit que les moyens de B', async () => {
      await put([CASH]);
      expect((await list(B.id, koffi)).map((m) => m.id)).toEqual([B_METHOD]);
    });
  });
});
