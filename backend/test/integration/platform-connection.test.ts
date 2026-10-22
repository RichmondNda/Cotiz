import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentTx, type TenantContext, TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { FOR_REQUEST } from '../../src/shared/tenant-context/tenant-database.js';
import { type IsolationHarness, startIsolationHarness, USERS } from '../isolation/harness.js';

/**
 * Connexion cotiz_platform (BYPASSRLS, architecture/02 ; lot 1.2, choix Q6) : réservée aux routes `/platform` du
 * contrat (jamais déduite du seul jeton : un jeton plateforme sur /me ou une route commune reste en cotiz_app), et aux
 * scripts qui la demandent explicitement dans l'espace platform.
 */
describe('TenantDatabase : connexion plateforme', () => {
  let h: IsolationHarness;
  let db: TenantDatabase;
  let appOnly: TenantDatabase;

  const role = () =>
    currentTx()
      .execute<{ role: string; space: string }>(sql`SELECT current_user AS role, app_space() AS space`)
      .then((r) => r.rows[0]);
  const platform: TenantContext = { space: 'platform', userId: USERS.awa };

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    db = new TenantDatabase({
      connectionString: h.db.urlFor('cotiz_app'),
      platformConnectionString: h.db.urlFor('cotiz_platform'),
      max: 2,
    });
    appOnly = new TenantDatabase({ connectionString: h.db.urlFor('cotiz_app'), max: 2 });
  });

  afterAll(async () => {
    await Promise.all([db.onModuleDestroy(), appOnly.onModuleDestroy()]);
    await h.stop();
  });

  it('route /platform avec un contexte platform : cotiz_platform', async () => {
    expect(await db[FOR_REQUEST](platform, role, { platformRoute: true })).toEqual({
      role: 'cotiz_platform',
      space: 'platform',
    });
  });

  it('jeton plateforme hors route /platform (/me, routes communes) : cotiz_app', async () => {
    expect(await db[FOR_REQUEST](platform, role)).toEqual({ role: 'cotiz_app', space: 'platform' });
  });

  it.each<[string, TenantContext | null]>([
    ['association', { space: 'association', associationId: '00000000-0000-7000-8000-00000000a001' }],
    ['subscriber', { space: 'subscriber', userId: USERS.moussa }],
    ['public', { space: 'public' }],
    ['sans contexte', null],
  ])('route /platform marquée mais contexte %s : refusé (jamais BYPASSRLS hors espace platform)', async (_n, ctx) => {
    let called = false;
    await expect(
      db[FOR_REQUEST](
        ctx,
        () => {
          called = true;
          return Promise.resolve(1);
        },
        { platformRoute: true },
      ),
    ).rejects.toThrow(/connexion plateforme/);
    expect(called).toBe(false);
  });

  it('script : withTenantContext(platform, { platformConnection }) en cotiz_platform, refusé hors espace platform', async () => {
    expect(await db.withTenantContext(platform, role, { platformConnection: true })).toEqual({
      role: 'cotiz_platform',
      space: 'platform',
    });
    expect(await db.withTenantContext(platform, role)).toEqual({ role: 'cotiz_app', space: 'platform' });
    await expect(db.withTenantContext({ space: 'auth' }, role, { platformConnection: true })).rejects.toThrow(
      /connexion plateforme/,
    );
  });

  it('sans PLATFORM_DATABASE_URL : route /platform refusée, jamais de repli sur cotiz_app', async () => {
    await expect(appOnly[FOR_REQUEST](platform, role, { platformRoute: true })).rejects.toThrow(
      /connexion plateforme non configurée/,
    );
    await expect(appOnly.withTenantContext(platform, role, { platformConnection: true })).rejects.toThrow(
      /connexion plateforme non configurée/,
    );
    expect(await appOnly[FOR_REQUEST](platform, role)).toEqual({ role: 'cotiz_app', space: 'platform' });
  });
});
