import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestAuthGuard } from '../support/test-auth.js';
import { AppModule } from '../../src/app.module.js';
import { loadConfig } from '../../src/config.js';
import { Audited, MASKED, recordAudit } from '../../src/shared/audit/index.js';
import { runWithRequestInfo } from '../../src/shared/request-info/index.js';
import {
  A,
  asManagerOf,
  asSubscriber,
  B,
  type IsolationHarness,
  startIsolationHarness,
  USERS,
} from '../isolation/harness.js';

const PROJECT = '00000000-0000-7000-8000-00000000c001';
const PAYMENT = '00000000-0000-7000-8000-0000000fa001';

/** Cas d'usage de test, écrits comme ceux des modules métier. */
class RenameProject {
  @Audited('project.update')
  execute(input: { name: string; fail?: boolean; associationId?: string | null }): Promise<string> {
    recordAudit({
      entityType: 'project',
      entityId: PROJECT,
      ...(input.associationId === undefined ? {} : { associationId: input.associationId }),
      before: { name: 'Ancien nom', status: 'active', secret: 'a' },
      after: { name: input.name, status: 'active', secret: 'b' },
    });
    if (input.fail) return Promise.reject(new Error('échec du cas d’usage'));
    return Promise.resolve('renommé');
  }
}

class ForgetsToRecord {
  @Audited('project.close')
  execute(): Promise<void> {
    return Promise.resolve();
  }
}

/** Décrit une seconde entité après sa propre fin (continuation détachée) : entrée refusée, jamais perdue en silence. */
let lateError: unknown;
class RecordsTooLate {
  @Audited('project.archive')
  execute(): Promise<void> {
    recordAudit({ entityType: 'project', entityId: PROJECT });
    setTimeout(() => {
      try {
        recordAudit({ entityType: 'project', entityId: PROJECT });
      } catch (error) {
        lateError = error;
      }
    }, 20);
    return Promise.resolve();
  }
}

class DeclarePayment {
  @Audited('payment.declare')
  execute(): Promise<void> {
    // Espace souscripteur : l'association vient de l'inscription, pas du contexte.
    recordAudit({ entityType: 'payment', entityId: PAYMENT, associationId: A.id, after: { amount: 25000 } });
    return Promise.resolve();
  }
}

class ValidateTwo {
  @Audited('payment.validate')
  execute(): Promise<void> {
    recordAudit({
      entityType: 'payment',
      entityId: PAYMENT,
      before: { status: 'pending' },
      after: { status: 'validated' },
    });
    recordAudit({ entityType: 'installment', entityId: PROJECT, before: { status: 'due' }, after: { status: 'paid' } });
    return Promise.resolve();
  }
}

interface AuditRow {
  actor_user_id: string | null;
  actor_role: string;
  association_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  request_id: string | null;
  ip: string | null;
  user_agent: string | null;
}

describe('shared/audit : @Audited', () => {
  let h: IsolationHarness;

  const rows = async (action?: string): Promise<AuditRow[]> =>
    (
      await h.superuser(
        `SELECT actor_user_id, actor_role, association_id, action, entity_type, entity_id, before, after, request_id,
                host(ip) AS ip, user_agent
           FROM audit_logs WHERE $1::text IS NULL OR action = $1 ORDER BY id`,
        [action ?? null],
      )
    ).rows as AuditRow[];

  const request = { requestId: 'req-42', ip: '203.0.113.7', userAgent: 'Vitest', actorRole: 'owner' };

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
  });

  afterAll(async () => {
    await h.stop();
  });

  it('écrit l’entrée dans la transaction : acteur, association, entité, champs modifiés, requête', async () => {
    const result = await runWithRequestInfo(request, () =>
      h.as(asManagerOf(A), () => new RenameProject().execute({ name: 'Nouveau nom' })),
    );
    expect(result).toBe('renommé');
    expect(await rows('project.update')).toEqual([
      {
        actor_user_id: USERS.awa,
        actor_role: 'owner',
        association_id: A.id,
        action: 'project.update',
        entity_type: 'project',
        entity_id: PROJECT,
        before: { name: 'Ancien nom', secret: MASKED },
        after: { name: 'Nouveau nom', secret: MASKED },
        request_id: 'req-42',
        ip: '203.0.113.7',
        user_agent: 'Vitest',
      },
    ]);
  });

  it('cas d’usage en échec : aucune entrée', async () => {
    const before = (await rows()).length;
    await expect(
      runWithRequestInfo(request, () =>
        h.as(asManagerOf(A), () => new RenameProject().execute({ name: 'x', fail: true })),
      ),
    ).rejects.toThrow('échec du cas d’usage');
    expect(await rows()).toHaveLength(before);
  });

  it('un cas d’usage audité qui ne décrit aucune entité échoue (et sa transaction est annulée)', async () => {
    await expect(h.as(asManagerOf(A), () => new ForgetsToRecord().execute())).rejects.toThrow(/project\.close/);
    expect(await rows('project.close')).toEqual([]);
  });

  it('recordAudit() hors d’un cas d’usage audité est refusé', () => {
    expect(() => {
      recordAudit({ entityType: 'project', entityId: PROJECT });
    }).toThrow(/@Audited/);
  });

  it('en espace association, refuse d’écrire le journal d’une autre association', async () => {
    await expect(
      h.as(asManagerOf(A), () => new RenameProject().execute({ name: 'x', associationId: B.id })),
    ).rejects.toThrow(/association du contexte/);
    expect((await rows('project.update')).filter((r) => r.association_id === B.id)).toEqual([]);
  });

  it('en espace association, refuse aussi une entrée sans association', async () => {
    await expect(
      h.as(asManagerOf(A), () => new RenameProject().execute({ name: 'x', associationId: null })),
    ).rejects.toThrow(/association du contexte/);
  });

  it('recordAudit() après la fin du cas d’usage est refusé', async () => {
    await h.as(asManagerOf(A), () => new RecordsTooLate().execute());
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(String(lateError)).toMatch(/project\.archive.*terminé/);
    expect(await rows('project.archive')).toHaveLength(1);
  });

  it('en espace souscripteur, l’association est celle du cas d’usage ; le gestionnaire la lit', async () => {
    await h.as(asSubscriber(USERS.moussa), () => new DeclarePayment().execute());
    const [row] = await rows('payment.declare');
    // Sans information de requête (tâche, test) : rôle déduit de l'espace, ni requête ni IP.
    expect(row).toMatchObject({
      actor_user_id: USERS.moussa,
      actor_role: 'subscriber',
      association_id: A.id,
      before: null,
      after: { amount: 25000 },
      request_id: null,
      ip: null,
      user_agent: null,
    });
    const seenByManager = await h.as(asManagerOf(A), (tx) =>
      tx.execute(sql`SELECT action FROM audit_logs WHERE action = 'payment.declare'`),
    );
    expect(seenByManager.rows).toHaveLength(1);
  });

  it('une entrée par entité décrite', async () => {
    await h.as(asManagerOf(A), () => new ValidateTwo().execute());
    expect((await rows('payment.validate')).map((r) => [r.entity_type, r.before, r.after])).toEqual([
      ['payment', { status: 'pending' }, { status: 'validated' }],
      ['installment', { status: 'due' }, { status: 'paid' }],
    ]);
  });

  it('une IP illisible n’est pas enregistrée', async () => {
    await runWithRequestInfo({ ...request, ip: 'pas-une-ip', requestId: 'req-ip' }, () =>
      h.as(asManagerOf(A), () => new RenameProject().execute({ name: 'IP' })),
    );
    const [row] = (await rows('project.update')).filter((r) => r.request_id === 'req-ip');
    expect(row?.ip).toBeNull();
  });

  it('refuse un nom d’action mal formé dès la déclaration', () => {
    expect(() => Audited('Valider paiement')).toThrow(/action/);
  });

  describe('par HTTP : identifiant de requête, IP et user-agent', () => {
    let app: INestApplication;
    let base: string;

    @Controller('audit-probe')
    class AuditProbeController {
      @Get()
      @Audited('probe.read')
      read(): Promise<{ ok: true }> {
        recordAudit({ entityType: 'probe', entityId: null });
        return Promise.resolve({ ok: true });
      }
    }

    @Module({ controllers: [AuditProbeController] })
    class ProbeModule {}

    beforeAll(async () => {
      const config = loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: h.db.urlFor('cotiz_app'),
        REDIS_URL: 'redis://127.0.0.1:1',
        S3_ENDPOINT: 'http://127.0.0.1:1',
      });
      // Route de test hors contrat : la garde de test remplace la chaîne d'authentification (requête anonyme).
      @Module({ imports: [AppModule.register(config, { guards: [TestAuthGuard] }), ProbeModule] })
      class TestRoot {}
      app = await NestFactory.create(TestRoot, { logger: false });
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
      base = `${await app.getUrl()}/api/v1`;
    });

    afterAll(async () => {
      await app.close();
    });

    it('reprend un X-Request-Id valide, l’IP du client et le user-agent', async () => {
      const res = await fetch(`${base}/audit-probe`, {
        headers: { 'x-request-id': 'front-7f3a', 'user-agent': 'Cotiz-Test/1.0' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-request-id')).toBe('front-7f3a');
      const [row] = (await rows('probe.read')).filter((r) => r.request_id === 'front-7f3a');
      // Requête sans garde : aucun contexte, rôle « anonymous ».
      expect(row).toMatchObject({
        actor_user_id: null,
        actor_role: 'anonymous',
        association_id: null,
        entity_type: 'probe',
        entity_id: null,
        user_agent: 'Cotiz-Test/1.0',
      });
      expect(['127.0.0.1', '::ffff:127.0.0.1']).toContain(row?.ip);
    });

    it('remplace un X-Request-Id invalide par un identifiant généré', async () => {
      for (const invalid of ['a b<script>', 'x'.repeat(129)]) {
        const res = await fetch(`${base}/audit-probe`, { headers: { 'x-request-id': invalid } });
        const generated = res.headers.get('x-request-id');
        expect(generated).toMatch(/^[0-9a-f-]{36}$/);
        const ids = (await rows('probe.read')).map((r) => r.request_id);
        expect(ids).not.toContain(invalid);
        expect(ids.at(-1)).toBe(generated);
      }
    });

    it('tronque un user-agent démesuré à 512 caractères', async () => {
      await fetch(`${base}/audit-probe`, { headers: { 'x-request-id': 'long-ua', 'user-agent': 'U'.repeat(2000) } });
      const [row] = (await rows('probe.read')).filter((r) => r.request_id === 'long-ua');
      expect(row?.user_agent).toBe('U'.repeat(512));
    });
  });
});
