import { Writable } from 'node:stream';
import { NestFactory } from '@nestjs/core';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { ENDPOINTS } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { CliModule } from '../../src/cli/cli.module.js';
import { runCli } from '../../src/cli/commands.js';
import { type Config, loadConfig } from '../../src/config.js';
import { DEV_PASSWORD } from '../../src/modules/identity/application/seed-dev-accounts.use-case.js';
import { invalidateSubscriberDashboard } from '../../src/modules/reporting/infra/subscriber-dashboard-cache.js';
import { mockId } from '../../src/shared/dev-seed/index.js';
import { REDIS_PREFIX } from '../../src/shared/queues/index.js';
import { StorageService } from '../../src/shared/storage/index.js';
import { type IsolationHarness, startIsolationHarness } from '../isolation/harness.js';

/**
 * Lot 3.2 · étape 1, vérification : avec le jeu de référence (`seed-dev`) au jour des maquettes
 * (seed-reference.yaml, `today: 2026-09-25`), le tableau de bord de Moussa donne `expected.subscriberDashboard_moussa`
 * (395 000 F restants sur 3 projets et 2 associations, 50 000 F en retard, prochaine échéance 25 000 F le 5 octobre),
 * et ses cartes ont les chiffres que voit la trésorière d'Entraide (en.list).
 */

const NOW = new Date('2026-09-25T10:00:00Z');
const Dashboard = ENDPOINTS['me.dash'].operations.get.response.body;
const Enrollments = ENDPOINTS['en.list'].operations.list.response.body;
const ENTRAIDE = mockId('association', 'entraide-yopougon');
const MAN = mockId('association', 'ressortissants-man');
const MOUSSA = mockId('user', 'moussa-diarra');
const CENTRE = mockId('project', 'centre-communautaire');
const VOYAGE = mockId('project', 'voyage-solidaire');
const MUTUELLE = mockId('project', 'mutuelle-sante');
const XOF = (amount: number) => ({ amount, currency: 'XOF' });

class Capture extends Writable {
  text = '';
  override _write(chunk: Buffer, _encoding: string, done: () => void): void {
    this.text += chunk.toString();
    done();
  }
}

describe('me.dash : tableau de bord souscripteur au 2026-09-25 (jeu de référence)', () => {
  let h: IsolationHarness;
  let redisContainer: StartedRedisContainer;
  let redis: Redis;
  let cli: INestApplicationContext;
  let api: INestApplication;
  let base: string;

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
    redis = new Redis(redisContainer.getConnectionUrl());
    cli = await NestFactory.createApplicationContext(CliModule.register(config), { logger: false });
    // Preuves de paiement : MinIO absent des tests.
    vi.spyOn(cli.get(StorageService), 'putObject').mockResolvedValue(undefined);
    expect(await runCli(cli, ['seed-dev'], { out: new Capture(), err: new Capture() })).toBe(0);
    api = await createApp(config, { logger: false });
    await api.listen(0, '127.0.0.1');
    base = `${await api.getUrl()}/api/v1`;
  }, 300_000);

  afterAll(async () => {
    redis.disconnect();
    await Promise.all([api.close(), cli.close()]);
    await Promise.all([h.stop(), redisContainer.stop()]);
    vi.useRealTimers();
  });

  const tokenOf = async (space: 'subscriber' | 'association', identifier: string) => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ space, identifier, password: DEV_PASSWORD }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { accessToken: string }).accessToken;
  };

  const dashboardOf = async (token: string) => {
    const res = await fetch(`${base}/me/dashboard`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    return Dashboard.parse(await res.json());
  };

  it('chiffres de expected.subscriberDashboard_moussa', async () => {
    await invalidateSubscriberDashboard(redis, MOUSSA);
    const d = await dashboardOf(await tokenOf('subscriber', '+2250544218790'));
    expect(d.remainingTotal).toEqual(XOF(395_000));
    expect(d.projectsCount).toBe(3);
    expect(d.associationsCount).toBe(2);
    expect(d.late).toEqual({ count: 2, amount: XOF(50_000) });
    expect(d.nextDue).toEqual({
      project: { id: CENTRE, name: 'Centre communautaire' },
      association: expect.objectContaining({ id: ENTRAIDE, name: 'Entraide Yopougon' }) as unknown,
      dueDate: '2026-10-05',
      amount: XOF(25_000),
    });
    expect(d.contractsToSign).toEqual([
      {
        project: { id: VOYAGE, name: 'Voyage solidaire' },
        association: expect.objectContaining({ id: ENTRAIDE }) as unknown,
      },
    ]);
    // Triées : retard, signature, prochaine échéance.
    expect(d.projects.map((p) => [p.project.id, p.standing])).toEqual([
      [CENTRE, 'late'],
      [VOYAGE, 'signature_required'],
      [MUTUELLE, 'up_to_date'],
    ]);
    expect(d.projects[0]).toMatchObject({
      paid: XOF(175_000),
      remaining: XOF(325_000),
      commitment: XOF(500_000),
      progress: 0.35,
      late: { count: 2, amount: XOF(50_000), since: '2026-08-05' },
      nextDue: { dueDate: '2026-10-05', amount: XOF(25_000) },
    });
    // Contrat à signer : aucun échéancier, engagement de l'échéancier qui sera généré (fonds d'entrée + 8 mois).
    expect(d.projects[1]).toMatchObject({
      paid: XOF(0),
      remaining: XOF(130_000),
      commitment: XOF(130_000),
      late: null,
      nextDue: null,
    });
    expect(d.projects[2]).toMatchObject({
      association: expect.objectContaining({ id: MAN }) as unknown,
      paid: XOF(50_000),
      remaining: XOF(70_000),
      commitment: XOF(120_000),
      late: null,
      nextDue: { dueDate: '2026-10-05', amount: XOF(10_000) },
    });
    // 3 derniers paiements déclarés, les plus récents d'abord (Mutuelle santé : septembre, août, juillet).
    expect(d.recentPayments.map((p) => [p.project.id, p.paidOn.slice(0, 7), p.status])).toEqual([
      [MUTUELLE, '2026-09', 'validated'],
      [MUTUELLE, '2026-08', 'validated'],
      [MUTUELLE, '2026-07', 'validated'],
    ]);
    expect(d.recentPayments[2]?.covered.map((c) => [c.sequence, c.amount.amount])).toEqual([
      [0, 20_000],
      [1, 10_000],
    ]);
  });

  it('cartes d’Entraide identiques à ce que voit la trésorière (en.list)', async () => {
    await invalidateSubscriberDashboard(redis, MOUSSA);
    const d = await dashboardOf(await tokenOf('subscriber', '+2250544218790'));
    const awa = await tokenOf('association', 'awa@entraide.ci');
    for (const projectId of [CENTRE, VOYAGE]) {
      const res = await fetch(`${base}/associations/${ENTRAIDE}/projects/${projectId}/enrollments?limit=100`, {
        headers: { authorization: `Bearer ${awa}` },
      });
      expect(res.status).toBe(200);
      const seen = Enrollments.parse(await res.json()).items.find((e) => e.member.id === MOUSSA);
      const card = d.projects.find((p) => p.project.id === projectId);
      expect(seen).toBeDefined();
      expect(card).toBeDefined();
      expect({
        id: card?.enrollmentId,
        standing: card?.standing,
        paid: card?.paid,
        remaining: card?.remaining,
        lateAmount: card?.late?.amount ?? XOF(0),
        commitment: card?.commitment,
      }).toEqual({
        id: seen?.id,
        standing: seen?.standing,
        paid: seen?.paid,
        remaining: seen?.remaining,
        lateAmount: seen?.lateAmount,
        commitment: seen?.commitment,
      });
    }
  });

  it('en cache 30 s par personne ; une invalidation fait recalculer', async () => {
    const key = `${REDIS_PREFIX}:cache:me.dash:${MOUSSA}`;
    await invalidateSubscriberDashboard(redis, MOUSSA);
    const token = await tokenOf('subscriber', '+2250544218790');
    const first = await dashboardOf(token);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
    // Entrée de cache modifiée à la main : servie telle quelle tant qu'elle n'est pas invalidée.
    const raw = JSON.parse((await redis.get(key)) ?? '{}') as { dashboard: typeof first; generation: string };
    raw.dashboard.projectsCount = 99;
    await redis.set(key, JSON.stringify(raw), 'EX', 30);
    expect((await dashboardOf(token)).projectsCount).toBe(99);
    await invalidateSubscriberDashboard(redis, MOUSSA);
    expect(await dashboardOf(token)).toEqual(first);
  });

  it('jeton gestionnaire refusé (espace souscripteur seulement)', async () => {
    const res = await fetch(`${base}/me/dashboard`, {
      headers: { authorization: `Bearer ${await tokenOf('association', 'awa@entraide.ci')}` },
    });
    expect(res.status).toBe(403);
  });
});
