import { Writable } from 'node:stream';
import { NestFactory } from '@nestjs/core';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { ENDPOINTS, Problem } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { CliModule } from '../../src/cli/cli.module.js';
import { runCli } from '../../src/cli/commands.js';
import { type Config, loadConfig } from '../../src/config.js';
import { DEV_PASSWORD } from '../../src/modules/identity/application/seed-dev-accounts.use-case.js';
import { mockId } from '../../src/shared/dev-seed/index.js';
import { StorageService } from '../../src/shared/storage/index.js';
import { type IsolationHarness, startIsolationHarness } from '../isolation/harness.js';

/**
 * Lot 3.4 · étape 1 : me.history (liste, synthèse) et me.history/series sur le jeu de référence (`seed-dev`) au
 * 2026-09-25. Vérification du lot : totaux = ceux du gestionnaire (en.list de la trésorière, cartes de me.dash déjà
 * prouvées égales). Moussa : Centre communautaire 175 000 F versés, Mutuelle santé 50 000 F, Voyage solidaire en
 * attente de signature ; reste 395 000 F (expected.subscriberDashboard_moussa).
 */

const NOW = new Date('2026-09-25T10:00:00Z');
const History = ENDPOINTS['me.history'].operations.list.response.body;
const Series = ENDPOINTS['me.history'].operations.series.response.body;
const Dashboard = ENDPOINTS['me.dash'].operations.get.response.body;
const Enrollments = ENDPOINTS['en.list'].operations.list.response.body;
const ENTRAIDE = mockId('association', 'entraide-yopougon');
const MAN = mockId('association', 'ressortissants-man');
const MOUSSA = mockId('user', 'moussa-diarra');
const CENTRE = mockId('project', 'centre-communautaire');
const MUTUELLE = mockId('project', 'mutuelle-sante');
const XOF = (amount: number) => ({ amount, currency: 'XOF' });

class Capture extends Writable {
  text = '';
  override _write(chunk: Buffer, _encoding: string, done: () => void): void {
    this.text += chunk.toString();
    done();
  }
}

describe('me.history : historique du souscripteur au 2026-09-25 (jeu de référence)', () => {
  let h: IsolationHarness;
  let redisContainer: StartedRedisContainer;
  let cli: INestApplicationContext;
  let api: INestApplication;
  let base: string;
  let moussa: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    [h, redisContainer] = await Promise.all([
      startIsolationHarness('migrated'),
      new RedisContainer('redis:7-alpine').start(),
    ]);
    const config: Config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      PLATFORM_DATABASE_URL: h.db.urlFor('cotiz_platform'),
      REDIS_URL: redisContainer.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      APP_PUBLIC_URL: 'https://app.cotiz.test',
      COTIZ_DEV_SEED: '1',
      RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
      RATE_LIMIT_IP_PER_MIN: '10000',
    });
    cli = await NestFactory.createApplicationContext(CliModule.register(config), { logger: false });
    // Preuves de paiement : MinIO absent des tests.
    vi.spyOn(cli.get(StorageService), 'putObject').mockResolvedValue(undefined);
    expect(await runCli(cli, ['seed-dev'], { out: new Capture(), err: new Capture() })).toBe(0);
    api = await createApp(config, { logger: false });
    await api.listen(0, '127.0.0.1');
    base = `${await api.getUrl()}/api/v1`;
    moussa = await tokenOf('subscriber', '+2250544218790');
  }, 300_000);

  afterAll(async () => {
    await Promise.all([api.close(), cli.close()]);
    await Promise.all([h.stop(), redisContainer.stop()]);
    vi.useRealTimers();
  });

  async function tokenOf(space: 'subscriber' | 'association', identifier: string) {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ space, identifier, password: DEV_PASSWORD }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { accessToken: string }).accessToken;
  }

  const get = (path: string, token = moussa) =>
    fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const historyOf = async (query = '') => {
    const res = await get(`/me/history${query}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    return History.parse(await res.json());
  };
  const seriesOf = async (query = '') => {
    const res = await get(`/me/history/series${query}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    return Series.parse(await res.json());
  };
  /**
   * Versements de Moussa dans le jeu de référence (seed-dev-payments), tous validés, date de virement = jour de la
   * déclaration, du plus récent au plus ancien : Mutuelle 10 000 (09-05), 10 000 (08-05), 30 000 (07-05, 08:30) ;
   * Centre 25 000 (07-05, 08:00), 25 000 (06-05), 25 000 (05-05), 25 000 (04-05), 75 000 (03-05).
   */
  const MOUSSA_PAYMENTS: [string, string, number][] = [
    [MUTUELLE, '2026-09-05', 10_000],
    [MUTUELLE, '2026-08-05', 10_000],
    [MUTUELLE, '2026-07-05', 30_000],
    [CENTRE, '2026-07-05', 25_000],
    [CENTRE, '2026-06-05', 25_000],
    [CENTRE, '2026-05-05', 25_000],
    [CENTRE, '2026-04-05', 25_000],
    [CENTRE, '2026-03-05', 75_000],
  ];

  it('synthèse : 225 000 F versés, reste 395 000 F ; liste de tous les statuts, plus récents d’abord', async () => {
    const all = await historyOf('?limit=100');
    expect(all.summary.totalPaid).toEqual(XOF(225_000));
    expect(all.summary.remaining).toEqual(XOF(395_000));
    expect(all.summary.paymentsCount).toBe(8);
    expect(all.total).toBe(8);
    expect(all.items.map((p) => [p.project.id, p.paidOn, p.amountDeclared.amount])).toEqual(MOUSSA_PAYMENTS);
    expect(all.nextCursor).toBeNull();
    // Plus récents d'abord (date de déclaration, puis identifiant).
    const keys = all.items.map((p) => `${p.declaredAt}|${p.id}`);
    expect(keys).toEqual([...keys].sort().reverse());
    expect(new Set(all.items.map((p) => p.association.id))).toEqual(new Set([ENTRAIDE, MAN]));
    // Les paiements de me.dash (3 derniers) en tête de l'historique.
    const dash = await get('/me/dashboard');
    const recent = Dashboard.parse(await dash.json()).recentPayments.map((p) => p.id);
    expect(all.items.slice(0, 3).map((p) => p.id)).toEqual(recent);
  });

  it('totaux = ceux du gestionnaire : Centre comme en.list de la trésorière ; Mutuelle (responsable de Man sans compte) en dur', async () => {
    const awa = await tokenOf('association', 'awa@entraide.ci');
    const res = await get(`/associations/${ENTRAIDE}/projects/${CENTRE}/enrollments?limit=100`, awa);
    expect(res.status).toBe(200);
    const seen = Enrollments.parse(await res.json()).items.find((e) => e.member.id === MOUSSA);
    const centre = await historyOf(`?projectId=${CENTRE}&limit=100`);
    expect(centre.summary.totalPaid).toEqual(seen?.paid);
    expect(centre.summary.totalPaid).toEqual(XOF(175_000));
    expect(centre.summary.remaining).toEqual(seen?.remaining);

    const mutuelle = await historyOf(`?projectId=${MUTUELLE}&limit=100`);
    expect(mutuelle.summary).toEqual({ totalPaid: XOF(50_000), paymentsCount: 3, remaining: XOF(70_000) });
    expect(mutuelle.items.every((p) => p.project.id === MUTUELLE)).toBe(true);
  });

  it('filtres : association, projet, période sur la date de virement (bornes comprises)', async () => {
    const all = await historyOf('?limit=100');
    const man = await historyOf(`?associationId=${MAN}&limit=100`);
    expect(man.items.length).toBeGreaterThan(0);
    expect(man.items.every((p) => p.association.id === MAN)).toBe(true);
    expect(man.items.map((p) => p.id)).toEqual(all.items.filter((p) => p.association.id === MAN).map((p) => p.id));
    expect(man.summary.totalPaid).toEqual(XOF(50_000));
    expect(man.summary.remaining).toEqual(XOF(70_000));

    const sameDay = await historyOf('?from=2026-07-05&to=2026-07-05&limit=100');
    expect(sameDay.items.map((p) => [p.project.id, p.paidOn])).toEqual([
      [MUTUELLE, '2026-07-05'],
      [CENTRE, '2026-07-05'],
    ]);
    expect(sameDay.summary).toMatchObject({ totalPaid: XOF(55_000), paymentsCount: 2 });
    // Le reste ne dépend pas de la période.
    expect(sameDay.summary.remaining).toEqual(XOF(395_000));

    const august = await historyOf('?from=2026-08-01&to=2026-08-31&limit=100');
    expect(august.items.map((p) => [p.project.id, p.paidOn])).toEqual([[MUTUELLE, '2026-08-05']]);
    expect(august.summary).toMatchObject({ totalPaid: XOF(10_000), paymentsCount: 1 });
    expect((await historyOf('?from=2026-06-06&to=2026-07-04')).items).toEqual([]);

    // Projet ou association qui n'est pas le sien : sélection vide, pas d'erreur.
    const none = await historyOf(`?projectId=${mockId('project', 'inconnu')}`);
    expect(none).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
      summary: { totalPaid: XOF(0), paymentsCount: 0, remaining: XOF(0) },
    });
  });

  it('pagination : pages de 2 sans doublon ni oubli ; curseur illisible ou tri inconnu → 422', async () => {
    const all = await historyOf('?limit=100');
    expect(all.items.length).toBeGreaterThan(2);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      pages += 1;
      const page: Awaited<ReturnType<typeof historyOf>> = await historyOf(
        `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      // 8 paiements : 4 pages pleines, la dernière sans curseur suivant (aucune page vide).
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(all.total);
      expect(page.summary).toEqual(all.summary);
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(all.items.map((p) => p.id));
    expect(pages).toBe(4);

    for (const query of ['?cursor=pas-un-curseur', '?sort=amount']) {
      const res = await get(`/me/history${query}`);
      expect(res.status).toBe(422);
      expect(Problem.parse(await res.json()).code).toBe('validation_failed');
    }
  });

  it('série : versé par mois de virement et par projet, cumul, objectif = engagements qui engagent (620 000 F)', async () => {
    const s = await seriesOf();
    expect(s.target).toEqual(XOF(500_000 + 120_000));
    const M = (month: string) => `2026-${month}-01`;
    expect(s.cumulative).toEqual(
      [
        ['03', 75_000],
        ['04', 100_000],
        ['05', 125_000],
        ['06', 150_000],
        ['07', 205_000],
        ['08', 215_000],
        ['09', 225_000],
      ].map(([m, paid]) => ({ month: M(m as string), paid: XOF(paid as number) })),
    );
    const centre = (paid: number) => ({ projectId: CENTRE, paid: XOF(paid) });
    const mutuelle = (paid: number) => ({ projectId: MUTUELLE, paid: XOF(paid) });
    // Projets d'un mois triés par identifiant.
    const july = [centre(25_000), mutuelle(30_000)].sort((a, b) => (a.projectId < b.projectId ? -1 : 1));
    expect(s.byMonth).toEqual([
      { month: M('03'), projects: [centre(75_000)] },
      { month: M('04'), projects: [centre(25_000)] },
      { month: M('05'), projects: [centre(25_000)] },
      { month: M('06'), projects: [centre(25_000)] },
      { month: M('07'), projects: july },
      { month: M('08'), projects: [mutuelle(10_000)] },
      { month: M('09'), projects: [mutuelle(10_000)] },
    ]);
    // Période : mois de la période seuls, mais cumul depuis le début des projets (versé jusqu'au 31 août : Centre
    // 175 000 F, Mutuelle 40 000 F), objectif inchangé.
    const aug = await seriesOf('?from=2026-08-01&to=2026-08-31');
    expect(aug).toEqual({
      cumulative: [{ month: M('08'), paid: XOF(215_000) }],
      target: XOF(620_000),
      byMonth: [{ month: M('08'), projects: [mutuelle(10_000)] }],
    });
    // Borne : les versements du jour `from` (5 juillet) sont dans la période, comptés une seule fois dans le cumul.
    expect(await seriesOf('?from=2026-07-05&to=2026-07-31')).toEqual({
      cumulative: [{ month: M('07'), paid: XOF(205_000) }],
      target: XOF(620_000),
      byMonth: [{ month: M('07'), projects: july }],
    });
    // Projet : son versé et son engagement seuls.
    const c = await seriesOf(`?projectId=${CENTRE}`);
    expect(c.target).toEqual(XOF(500_000));
    expect(c.cumulative.at(-1)?.paid).toEqual(XOF(175_000));
    expect(c.byMonth.flatMap((m) => m.projects.map((p) => p.projectId))).toEqual(c.byMonth.map(() => CENTRE));
    const man = await seriesOf(`?associationId=${MAN}`);
    expect(man.target).toEqual(XOF(120_000));
    expect(man.cumulative.at(-1)?.paid).toEqual(XOF(50_000));
    expect(man.byMonth.flatMap((m) => m.projects.map((p) => p.projectId))).toEqual(man.byMonth.map(() => MUTUELLE));
  });

  // Modifie le jeu de référence (inscription retirée) : en dernier, sauf le test des accès.
  it('inscription retirée : ses paiements restent dans l’historique et au détail (marqués), hors du reste et de l’objectif', async () => {
    await h.superuser(
      `UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE user_id = $1 AND project_id = $2`,
      [MOUSSA, MUTUELLE],
    );
    const all = await historyOf('?limit=100');
    expect(all.items.map((p) => [p.project.id, p.paidOn, p.amountDeclared.amount])).toEqual(MOUSSA_PAYMENTS);
    expect(all.items.map((p) => [p.project.id, p.enrollmentWithdrawn])).toEqual(
      MOUSSA_PAYMENTS.map(([pid]) => [pid, pid === MUTUELLE]),
    );
    // Versé : tout ce qui a été validé ; reste et objectif : inscriptions qui engagent seulement (Mutuelle : 70 000 F).
    expect(all.summary.totalPaid).toEqual(XOF(225_000));
    expect(all.summary.remaining).toEqual(XOF(325_000));
    expect((await seriesOf()).target).toEqual(XOF(500_000));
    expect((await historyOf(`?projectId=${MUTUELLE}`)).items).toHaveLength(3);
    const mutuelle = all.items.find((p) => p.project.id === MUTUELLE);
    const detail = await get(`/me/payments/${mutuelle?.id ?? ''}`);
    expect(detail.status).toBe(200);
    expect(((await detail.json()) as { enrollmentWithdrawn: boolean }).enrollmentWithdrawn).toBe(true);
    // Plus de fiche projet (inscription retirée) : rien à déclarer.
    expect((await get(`/me/projects/${MUTUELLE}`)).status).toBe(404);
  });

  it('jeton gestionnaire → 403 ; sans jeton → 401 ; paramètre invalide → 422', async () => {
    const awa = await tokenOf('association', 'awa@entraide.ci');
    expect((await get('/me/history', awa)).status).toBe(403);
    expect((await get('/me/history/series', awa)).status).toBe(403);
    expect((await fetch(`${base}/me/history`)).status).toBe(401);
    expect((await get('/me/history?from=2026-13-01')).status).toBe(422);
    expect((await get('/me/history/series?projectId=pas-un-uuid')).status).toBe(422);
  });
});
