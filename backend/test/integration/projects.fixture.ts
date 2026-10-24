import { Project } from '@cotiz/contracts';
import { expect } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { type PlatformFixture, startPlatformFixture } from './platform-associations.fixture.js';

/**
 * Jeu des tests du module projects (lot 2.2) : celui des tests plateforme (A en Essentiel, 5 projets ; B en Pro,
 * illimité), plus une manager (Aminata) et un viewer (Koffi, owner de B) dans A, et des moyens de paiement : dans A,
 * Orange Money (actif) et Wave (inactif) ; dans B, un virement.
 */

export const METHODS = {
  orangeA: '00000000-0000-7000-8000-0000000aa201',
  waveInactiveA: '00000000-0000-7000-8000-0000000aa202',
  bankB: '00000000-0000-7000-8000-0000000aa203',
} as const;

export const xof = (amount: number) => ({ amount, currency: 'XOF' });

/** Projet à dates fixes de la maquette : 25 000 F par mois de mars 2026 à août 2027 (18 échéances), entrée 50 000 F. */
export const FIXED = {
  name: 'Centre communautaire',
  description: 'Construction du **centre** de Yopougon.',
  requiredSubscribers: 60,
  graceDays: 5,
  entryFee: xof(50000),
  installmentAmount: xof(25000),
  frequency: 'monthly',
  dueDay: 5,
  scheduleType: 'fixed',
  startDate: '2026-03-01',
  endDate: '2027-08-31',
  paymentMethods: [{ paymentMethodId: METHODS.orangeA, instructionsOverride: 'Indiquez votre nom en référence' }],
} as const;

/** Cycle roulant hebdomadaire, sans fonds d'entrée ni limite de souscripteurs. */
export const ROLLING = {
  name: 'Tontine du samedi',
  description: '',
  requiredSubscribers: null,
  graceDays: 2,
  entryFee: null,
  installmentAmount: xof(5000),
  frequency: 'weekly',
  dueDay: 6,
  scheduleType: 'rolling',
  startDate: '2026-11-07',
  endDate: null,
  paymentMethods: [],
} as const;

export interface ProjectsFixture extends PlatformFixture {
  tokens: { awa: string; aminata: string; koffi: string; moussa: string };
  /** pr.create avec une clé d'idempotence neuve (ou donnée). */
  create: (body: unknown, options?: { aid?: string; token?: string; key?: string }) => Promise<Response>;
  /** pr.create réussi : le projet du contrat. */
  created: (body: unknown, options?: { aid?: string; token?: string }) => Promise<Project>;
  /** Projets, liens et événements de projet effacés entre deux tests (le journal d'audit est en ajout seul). */
  reset: () => Promise<void>;
}

/** `env` : variables de configuration en plus (stockage réel pour pr.upload). */
export async function startProjectsFixture(env: Record<string, string> = {}): Promise<ProjectsFixture> {
  const f = await startPlatformFixture([], env);
  await f.h.superuser(
    `UPDATE memberships SET role = 'manager', status = 'active', joined_at = now()
      WHERE association_id = $1 AND user_id = $2`,
    [A.id, USERS.aminata],
  );
  await f.h.superuser(
    `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
     VALUES (gen_random_uuid(), $1, $2, 'viewer', 'active', now())`,
    [A.id, USERS.koffi],
  );
  await f.h.superuser(
    `INSERT INTO association_payment_methods (id, association_id, kind, label, details, position, is_active) VALUES
       ($1, $4, 'mobile_money', 'Orange Money', '{"operator":"orange","number":"+2250708091011"}', 0, true),
       ($2, $4, 'mobile_money', 'Wave', '{"operator":"wave","number":"+2250500000001"}', 1, false),
       ($3, $5, 'bank_transfer', 'SGBCI', '{"iban":"CI93 CI00 8011 1234 5678 9012 34"}', 0, true)`,
    [METHODS.orangeA, METHODS.waveInactiveA, METHODS.bankB, A.id, B.id],
  );
  const [awa, aminata, koffi, moussa] = await Promise.all([
    f.login('association', 'awa@test.cotiz.app'),
    f.login('association', 'aminata@test.cotiz.app'),
    f.login('association', 'koffi@test.cotiz.app'),
    f.login('subscriber', 'moussa@test.cotiz.app'),
  ]);

  const create: ProjectsFixture['create'] = (body, options = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/projects`, {
      token: options.token ?? awa,
      method: 'POST',
      body,
      headers: { 'idempotency-key': options.key ?? crypto.randomUUID() },
    });
  const created: ProjectsFixture['created'] = async (body, options = {}) => {
    const res = await create(body, options);
    expect(res.status).toBe(201);
    return Project.parse(await res.json());
  };
  const reset = async () => {
    await f.h.superuser('DELETE FROM project_payment_methods');
    await f.h.superuser('DELETE FROM projects');
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type LIKE 'project.%'`);
  };
  return { ...f, tokens: { awa, aminata, koffi, moussa }, create, created, reset };
}
