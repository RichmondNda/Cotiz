import { Writable } from 'node:stream';
import { NestFactory } from '@nestjs/core';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { ENDPOINTS } from '@cotiz/contracts';
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
 * Lot 2.6 · étape 2, vérification du lot : avec le jeu de référence (`seed-dev`) au jour des maquettes
 * (docs/specs/seed-reference.yaml, `today: 2026-09-25`), le tableau de bord d'Entraide Yopougon affiche les chiffres
 * de `expected.managerDashboard` : 1 240 000 F collectés sur 1 300 000 F attendus ce mois, 6 paiements à valider,
 * 14 souscripteurs en retard sur 52, 82 % de recouvrement.
 */

const NOW = new Date('2026-09-25T10:00:00Z');
const Dashboard = ENDPOINTS['as.dashboard'].operations.get.response.body;
const ENTRAIDE = mockId('association', 'entraide-yopougon');

class Capture extends Writable {
  text = '';
  override _write(chunk: Buffer, _encoding: string, done: () => void): void {
    this.text += chunk.toString();
    done();
  }
}

describe('jeu de référence : tableau de bord d’Entraide Yopougon au 2026-09-25', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let cli: INestApplicationContext;
  let api: INestApplication;
  let base: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    const config: Config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      PLATFORM_DATABASE_URL: h.db.urlFor('cotiz_platform'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      APP_PUBLIC_URL: 'https://app.cotiz.test',
      COTIZ_DEV_SEED: '1',
      RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
      RATE_LIMIT_IP_PER_MIN: '10000',
    });
    cli = await NestFactory.createApplicationContext(CliModule.register(config), { logger: false });
    // Preuves de paiement : MinIO absent des tests.
    vi.spyOn(cli.get(StorageService), 'putObject').mockResolvedValue(undefined);
    const out = new Capture();
    const err = new Capture();
    expect(await runCli(cli, ['seed-dev'], { out, err })).toBe(0);
    api = await createApp(config, { logger: false });
    await api.listen(0, '127.0.0.1');
    base = `${await api.getUrl()}/api/v1`;
  }, 300_000);

  afterAll(async () => {
    await Promise.all([api.close(), cli.close()]);
    await Promise.all([h.stop(), redis.stop()]);
    vi.useRealTimers();
  });

  const dashboardOfAwa = async () => {
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ space: 'association', identifier: 'awa@entraide.ci', password: DEV_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const { accessToken } = (await login.json()) as { accessToken: string };
    const res = await fetch(`${base}/associations/${ENTRAIDE}/dashboard`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    return Dashboard.parse(await res.json());
  };

  it('1 240 000 F / 1 300 000 F, 6 à valider (le plus ancien il y a 3 jours), 14 retards sur 52, 82 %', async () => {
    const d = await dashboardOfAwa();
    expect(d.collectedThisMonth).toEqual({ amount: 1_240_000, currency: 'XOF' });
    expect(d.expectedThisMonth).toEqual({ amount: 1_300_000, currency: 'XOF' });
    expect(d.paymentsToReview).toEqual({ count: 6, oldestDeclaredAt: '2026-09-22T10:41:00.000Z' });
    expect(d.lateSubscribers).toEqual({ count: 14, activeCount: 52 });
    expect(d.subscribersCount).toBe(52);
    expect(d.recoveryRate).toBeCloseTo(0.82, 12);
    // Le projet qui a le plus de retards d'abord : Centre communautaire, 14 retards.
    expect(d.projects[0]?.name).toBe('Centre communautaire');
    expect(d.projects[0]?.stats.lateSubscribersCount).toBe(14);
  });
});
