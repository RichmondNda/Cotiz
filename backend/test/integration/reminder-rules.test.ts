import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B } from '../isolation/harness.js';
import { PLANS } from './platform-associations.fixture.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Lot 4.3 · étape 2 : règles de relance (rm.rules). Création, liste, modification partielle ; contrôles de la règle
 * (décalage selon le déclencheur, canaux sans fournisseur, message et variables) ; message gardé comme modèle de
 * l'association (nouvelle version seulement si le texte change) ; fonctionnalité `auto_reminders` exigée pour écrire ;
 * audit ; lecteur refusé ; projet d'une autre association introuvable.
 */

const Rule = ENDPOINTS['rm.rules'].operations.create.response.body;
const List = ENDPOINTS['rm.rules'].operations.list.response.body;

const RULE = {
  projectId: null,
  trigger: 'after_due',
  offsetDays: 7,
  channels: ['in_app', 'push'],
  message: 'Bonjour {{prenom}}, votre échéance du {{echeance}} pour {{projet}} ({{montant}}) reste à régler.',
  isActive: true,
} as const;

describe('règles de relance (rm.rules)', () => {
  let f: MembersFixture;

  const create = (body: unknown, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/reminder-rules`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
    });
  const patch = (id: string, body: unknown, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/reminder-rules/${id}`, {
      token: options.token ?? f.tokens.awa,
      method: 'PATCH',
      body,
    });
  const list = async (token = f.tokens.awa) => {
    const res = await f.call(`/associations/${A.id}/reminder-rules`, { token });
    expect(res.status).toBe(200);
    return List.parse(await res.json()).items;
  };
  const created = async (body: unknown = RULE) => {
    const res = await create(body);
    expect(res.status).toBe(201);
    return Rule.parse(await res.json());
  };
  const templates = async () =>
    (
      await f.h.superuser(
        `SELECT body, version FROM message_templates WHERE association_id = $1 AND key = 'reminder.rule'
          ORDER BY created_at, version`,
        [A.id],
      )
    ).rows as { body: string; version: number }[];
  const audits = async (action: string) =>
    (await f.h.superuser(`SELECT entity_id FROM audit_logs WHERE action = $1 ORDER BY created_at`, [action])).rows as {
      entity_id: string;
    }[];

  beforeAll(async () => {
    f = await startMembersFixture();
  });

  afterAll(async () => {
    await f.stop();
  });

  beforeEach(async () => {
    await f.h.superuser('DELETE FROM reminder_runs');
    await f.h.superuser('DELETE FROM reminder_rules');
    await f.h.superuser(`DELETE FROM message_templates WHERE key = 'reminder.rule'`);
    await f.h.superuser('UPDATE plans SET features = $2 WHERE id = ANY($1)', [
      [PLANS.essentiel, PLANS.pro],
      ['auto_reminders'],
    ]);
  });

  it('création : 201, règle relue dans la liste, message gardé comme modèle, audit', async () => {
    const rule = await created();
    expect(rule).toMatchObject({ ...RULE, channels: ['in_app', 'push'] });
    expect(await list()).toEqual([rule]);
    expect(await templates()).toEqual([{ body: RULE.message, version: 1 }]);
    expect((await audits('reminder_rule.create')).map((a) => a.entity_id)).toContain(rule.id);
  });

  it('règle d’un projet de l’association ; projet d’une autre association : 404', async () => {
    expect((await created({ ...RULE, projectId: PROJECTS.a })).projectId).toBe(PROJECTS.a);
    expect((await create({ ...RULE, projectId: PROJECTS.b })).status).toBe(404);
  });

  it('contrôles : décalage, canaux sans fournisseur, message et variables (422 validation_failed)', async () => {
    const refused = async (body: unknown) => {
      const res = await create(body);
      expect(res.status).toBe(422);
      return ((await res.json()) as { fields?: Record<string, string> }).fields;
    };
    expect(await refused({ ...RULE, trigger: 'on_due', offsetDays: 3 })).toEqual({ offsetDays: 'must_be_zero' });
    expect(await refused({ ...RULE, trigger: 'before_due', offsetDays: 0 })).toEqual({
      offsetDays: 'must_be_positive',
    });
    expect(await refused({ ...RULE, channels: ['sms'] })).toEqual({ channels: 'channel_unavailable' });
    expect(await refused({ ...RULE, channels: ['in_app', 'in_app'] })).toEqual({ channels: 'duplicate' });
    expect(await refused({ ...RULE, message: '   ' })).toEqual({ message: 'required' });
    expect(await refused({ ...RULE, message: 'Bonjour {{surnom}}' })).toEqual({ message: 'unknown_variable' });
    expect(await list()).toEqual([]);
    expect(await templates()).toEqual([]);
  });

  it('modification partielle : désactiver garde le message et son modèle ; un nouveau texte ajoute une version', async () => {
    const rule = await created();
    const off = await patch(rule.id, { isActive: false });
    expect(off.status).toBe(200);
    expect(Rule.parse(await off.json())).toEqual({ ...rule, isActive: false });
    expect(await templates()).toHaveLength(1);

    const message = 'Rappel : {{montant}} à régler pour {{projet}}.';
    const next = { ...rule, isActive: false, message, trigger: 'before_due', offsetDays: 3 };
    const changed = await patch(rule.id, { message, trigger: 'before_due', offsetDays: 3 });
    expect(Rule.parse(await changed.json())).toEqual(next);
    expect(await templates()).toEqual([
      { body: RULE.message, version: 1 },
      { body: message, version: 2 },
    ]);
    expect(await list()).toEqual([next]);
    expect((await audits('reminder_rule.update')).filter((a) => a.entity_id === rule.id)).toHaveLength(2);
  });

  it('modification : la règle complète est recontrôlée (le jour même avec un décalage gardé : 422)', async () => {
    const rule = await created();
    expect((await patch(rule.id, { trigger: 'on_due' })).status).toBe(422);
    expect(await list()).toEqual([rule]);
  });

  it('sans la fonctionnalité auto_reminders : écriture refusée (403 feature_disabled), lecture permise', async () => {
    const rule = await created();
    await f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [PLANS.essentiel, []]);
    const res = await create(RULE);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('feature_disabled');
    expect((await patch(rule.id, { isActive: false })).status).toBe(403);
    expect(await list()).toEqual([rule]);
  });

  it('lecteur (Koffi, viewer de A) et souscripteur : refusés', async () => {
    expect((await create(RULE, { token: f.tokens.koffi })).status).toBe(403);
    expect((await f.call(`/associations/${A.id}/reminder-rules`, { token: f.tokens.koffi })).status).toBe(403);
    expect([403, 404]).toContain((await create(RULE, { token: f.tokens.moussa })).status);
    expect(await list()).toEqual([]);
  });

  it('règle de A modifiée par l’espace de B : 404, rien de modifié', async () => {
    const rule = await created();
    expect((await patch(rule.id, { isActive: false }, { aid: B.id, token: f.tokens.koffi })).status).toBe(404);
    expect(await list()).toEqual([rule]);
  });
});
