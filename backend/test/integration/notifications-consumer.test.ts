import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EventEnvelope, EventType } from '@cotiz/contracts';
import { Money } from '@cotiz/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { NotificationRouter } from '../../src/modules/notifications/application/notification-router.js';
import { paymentValidatedMessage } from '../../src/modules/notifications/domain/messages.js';
import { NotificationsConsumer } from '../../src/modules/notifications/events/notifications.consumer.js';
import { EventsProcessor } from '../../src/shared/outbox/events.processor.js';
import { TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { STAFF } from './platform-associations.fixture.js';

/**
 * Lot 2.5 · étape 2 : consommateur `notifications`. Un événement métier → une notification par destinataire, lue
 * dans la cloche ; destinataires lus dans le contexte de l'association de l'événement (RLS), écriture en espace system,
 * rejouable (`dedupe_key` `{eventId}:{userId}`). Jeu : A = Awa owner, Aminata manager, Koffi viewer, Moussa
 * souscripteur ; B = Koffi owner, Awa et Fatou souscriptrices ; plateforme : Richy owner, Sali support.
 */

interface Row {
  user_id: string;
  association_id: string | null;
  type: string;
  title: string;
  action_url: string | null;
  data: Record<string, unknown>;
}

describe('consommateur notifications', () => {
  let f: LedgerFixture;
  let worker: INestApplicationContext;
  let consumer: NotificationsConsumer;
  let seq = 1000;

  const envelope = (
    type: EventType,
    associationId: string | null,
    payload: Record<string, unknown>,
    occurredAt = new Date().toISOString(),
  ): EventEnvelope => ({
    id: String(++seq),
    type,
    version: 1,
    occurredAt,
    associationId,
    actorUserId: null,
    aggregate: { type: 'test', id: crypto.randomUUID() },
    payload,
  });
  const rows = async () =>
    (
      await f.h.superuser(
        `SELECT user_id, association_id, type, title, action_url, data FROM notifications ORDER BY created_at, user_id`,
      )
    ).rows as Row[];
  const usersOf = async () => (await rows()).map((r) => r.user_id).sort();

  /** Inscriptions posées en base (une par personne et par test) : Moussa chez A, Fatou chez B. */
  let enrollments = new Map<string, string>();
  let month = 0;
  /**
   * Paiement posé en base comme la déclaration du lot 3.3 (puis la relecture du lot 2.4), sur l'échéance du mois
   * suivant à chaque appel : 25 000 F, répartition proposée (en attente), confirmée (validé) ou annulée (rejeté).
   */
  const payment = async (status: 'pending' | 'validated' | 'rejected', associationId = A.id) => {
    const inA = associationId === A.id;
    const userId = inA ? USERS.moussa : USERS.fatou;
    const projectId = inA ? PROJECTS.a : PROJECTS.b;
    let enrollmentId = enrollments.get(userId);
    if (!enrollmentId) {
      enrollmentId = (
        await f.enrollByApi(
          { userId, startsFrom: '2026-03-01' },
          { aid: associationId, pid: projectId, token: inA ? f.tokens.awa : f.tokens.koffi },
        )
      ).id;
      enrollments.set(userId, enrollmentId);
    }
    const due = new Date(Date.UTC(2026, 2 + month++, 5)).toISOString().slice(0, 10);
    const installmentId = await f.installmentOf(enrollmentId, due);
    const state = status === 'pending' ? 'proposed' : status === 'validated' ? 'confirmed' : 'voided';
    return f.record({
      enrollmentId,
      userId,
      associationId,
      projectId,
      amount: 25_000,
      status,
      declaredAt: '2026-04-01T09:00:00Z',
      lines: [{ installmentId, amount: 25_000, state }],
      ...(status === 'pending' ? {} : { reviewedBy: USERS.awa, reviewedAt: '2026-04-02T09:00:00Z' }),
      ...(status === 'validated' ? { amountReceived: 25_000 } : {}),
      ...(status === 'rejected' ? { rejection: { code: 'not_received', message: null } } : {}),
    });
  };

  beforeAll(async () => {
    f = await startLedgerFixture();
    worker = await NestFactory.createApplicationContext(
      WorkerModule.register(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_URL: f.h.db.urlFor('cotiz_app'),
          REDIS_URL: f.redis.getConnectionUrl(),
          S3_ENDPOINT: 'http://127.0.0.1:1',
          OUTBOX_RELAY_INTERVAL_MS: '0',
        }),
      ),
      { logger: false },
    );
    consumer = worker.get(NotificationsConsumer);
  });

  afterAll(async () => {
    await worker.close();
    await f.stop();
  });

  beforeEach(async () => {
    enrollments = new Map();
    month = 0;
    await f.h.superuser('DELETE FROM notifications');
    await f.resetLedger();
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
  });

  describe('paiements (souscripteur)', () => {
    it('un paiement validé → exactement une notification, même rejoué (file et consommateur)', async () => {
      const paymentId = await payment('validated');
      const event = envelope('payment.validated', A.id, {
        paymentId,
        userId: USERS.moussa,
        amountReceived: 25_000,
        installmentIds: [],
      });
      const processor = worker.get(EventsProcessor);
      await processor.process(event);
      await processor.process(event);
      await consumer.handle(event);
      expect(await rows()).toEqual([
        {
          user_id: USERS.moussa,
          association_id: A.id,
          type: 'payment.validated',
          title: 'Paiement validé',
          action_url: `/projets/${PROJECTS.a}`,
          data: { actionLabel: 'Voir le projet', paymentId, projectId: PROJECTS.a, audience: 'subscriber' },
        },
      ]);
    });

    it('rejet et annulation : une notification au souscripteur, avec le lien du projet', async () => {
      const rejected = await payment('rejected');
      await consumer.handle(
        envelope('payment.rejected', A.id, { paymentId: rejected, userId: USERS.moussa, reasonCode: 'not_received' }),
      );
      const reverted = await payment('pending');
      await consumer.handle(envelope('payment.reverted', A.id, { paymentId: reverted, revertedBy: USERS.awa }));
      expect((await rows()).map((r) => [r.user_id, r.type, r.action_url])).toEqual([
        [USERS.moussa, 'payment.rejected', `/projets/${PROJECTS.a}`],
        [USERS.moussa, 'payment.reverted', `/projets/${PROJECTS.a}`],
      ]);
    });

    it('paiement d’une autre association que celle de l’événement : rien (filtre d’association)', async () => {
      const theirs = await payment('validated', B.id);
      await consumer.handle(
        envelope('payment.validated', A.id, {
          paymentId: theirs,
          userId: USERS.fatou,
          amountReceived: 25_000,
          installmentIds: [],
        }),
      );
      expect(await rows()).toEqual([]);
    });
  });

  describe('déclarations (gestionnaires)', () => {
    const declared = (paymentId: string, aid = A.id) =>
      envelope('payment.declared', aid, {
        paymentId,
        projectId: aid === A.id ? PROJECTS.a : PROJECTS.b,
        userId: aid === A.id ? USERS.moussa : USERS.fatou,
        amount: 25_000,
      });

    it('owner et manager actifs de l’association seulement (ni viewer, ni autre association)', async () => {
      await consumer.handle(declared(await payment('pending')));
      expect(await usersOf()).toEqual([USERS.awa, USERS.aminata].sort());
      const [first] = await rows();
      expect(first).toMatchObject({ association_id: A.id, title: 'Nouvelle déclaration de paiement' });
      expect(first?.action_url).toMatch(/^\/asso\/paiements\/[0-9a-f-]{36}$/);
      expect(first?.data.audience).toBe('manager');

      await f.h.superuser('DELETE FROM notifications');
      await consumer.handle(declared(await payment('pending', B.id), B.id));
      // Awa est souscriptrice de B : elle n'est pas notifiée des déclarations de B.
      expect(await usersOf()).toEqual([USERS.koffi]);
    });

    it('plus de 5 déclarations en 1 h : les suivantes deviennent un seul récapitulatif par gestionnaire', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 8; i++) ids.push(await payment('pending'));
      for (const id of ids) await consumer.handle(declared(id));
      const all = await rows();
      for (const manager of [USERS.awa, USERS.aminata]) {
        const own = all.filter((r) => r.user_id === manager);
        expect(own.filter((r) => r.data.digest !== true)).toHaveLength(5);
        expect(own.filter((r) => r.data.digest === true)).toEqual([
          expect.objectContaining({ title: '8 paiements à valider', action_url: '/asso/paiements' }),
        ]);
      }
    });

    it('rejouée, une déclaration déjà notifiée n’est ni recomptée ni regroupée', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) ids.push(await payment('pending'));
      const events = ids.map((id) => declared(id));
      for (const e of events) await consumer.handle(e);
      for (const e of events) await consumer.handle(e);
      expect((await rows()).filter((r) => r.data.digest === true)).toEqual([]);
      expect(await rows()).toHaveLength(10);
    });
  });

  describe('inscription, activation, réinitialisation, demande', () => {
    it('inscription d’un compte existant : le souscripteur ; compte neuf : rien (code remis par une personne)', async () => {
      const enrolled = (isNewAccount: boolean) =>
        envelope('member.enrolled', A.id, {
          enrollmentId: crypto.randomUUID(),
          projectId: PROJECTS.a,
          userId: USERS.moussa,
          isNewAccount,
        });
      await consumer.handle(enrolled(true));
      expect(await rows()).toEqual([]);
      await consumer.handle(enrolled(false));
      expect(await rows()).toEqual([
        expect.objectContaining({
          user_id: USERS.moussa,
          title: 'Nouveau projet',
          action_url: `/projets/${PROJECTS.a}`,
        }),
      ]);
    });

    it('compte activé : gestionnaires de chaque association listée, jamais une association étrangère', async () => {
      await consumer.handle(envelope('user.activated', null, { userId: USERS.moussa, associationIds: [A.id, B.id] }));
      // Moussa n'appartient pas à B : son nom n'y est pas lu, Koffi (owner de B) n'est pas notifié.
      expect(await usersOf()).toEqual([USERS.awa, USERS.aminata].sort());
      expect((await rows())[0]).toMatchObject({ action_url: `/asso/souscripteurs/${USERS.moussa}` });
    });

    it('réinitialisation : souscripteur → gestionnaires de l’association ; sinon → plateforme (owner, admin)', async () => {
      await consumer.handle(
        envelope('password_reset.requested', A.id, {
          requestId: crypto.randomUUID(),
          userId: USERS.moussa,
          associationIds: [A.id],
          space: 'subscriber',
        }),
      );
      expect(await usersOf()).toEqual([USERS.awa, USERS.aminata].sort());
      await f.h.superuser('DELETE FROM notifications');
      await consumer.handle(
        envelope('password_reset.requested', null, {
          requestId: crypto.randomUUID(),
          userId: USERS.awa,
          associationIds: [],
          space: 'association',
        }),
      );
      const platform = await rows();
      expect(platform.map((r) => [r.user_id, r.association_id, r.action_url, r.data.audience])).toEqual([
        [STAFF.owner.id, null, '/plateforme/reinitialisations', 'platform'],
      ]);
    });

    it('demande de création : personnel owner et admin de la plateforme (pas support)', async () => {
      const requestId = crypto.randomUUID();
      await consumer.handle(
        envelope('association.request_submitted', null, {
          requestId,
          reference: 'REQ-2026-0001',
          associationName: 'Tontine d’Adjamé',
        }),
      );
      expect((await rows()).map((r) => [r.user_id, r.title, r.action_url])).toEqual([
        [STAFF.owner.id, 'Nouvelle demande de création', `/plateforme/demandes/${requestId}`],
      ]);
    });
  });

  describe('montants (relecture argent)', () => {
    const bodies = async () =>
      ((await f.h.superuser('SELECT body FROM notifications ORDER BY created_at')).rows as { body: string }[]).map(
        (r) => r.body,
      );
    const fmt = (n: string) => n.replace(' ', String.fromCharCode(0x202f)) + String.fromCharCode(0xa0) + 'F';

    it('validé : le montant reçu de l’événement, même si la ligne a été annulée depuis', async () => {
      // Déclaré 25 000 F, validé à 20 000 F reçus, puis annulé avant le passage du consommateur (ligne en attente).
      const paymentId = await payment('pending');
      await consumer.handle(
        envelope('payment.validated', A.id, {
          paymentId,
          userId: USERS.moussa,
          amountReceived: 20_000,
          installmentIds: [],
        }),
      );
      await consumer.handle(envelope('payment.reverted', A.id, { paymentId, revertedBy: USERS.awa }));
      expect(await bodies()).toEqual([
        `Vos ${fmt('20 000')} pour Centre communautaire ont été validés.`,
        `Votre déclaration de ${fmt('25 000')} pour Centre communautaire est de nouveau en attente : sa validation a été annulée.`,
      ]);
    });
  });

  describe('isolation (relecture)', () => {
    it('déclaration portant A pour un paiement de B : rien', async () => {
      const theirs = await payment('pending', B.id);
      await consumer.handle(
        envelope('payment.declared', A.id, {
          paymentId: theirs,
          projectId: PROJECTS.b,
          userId: USERS.fatou,
          amount: 25_000,
        }),
      );
      expect(await rows()).toEqual([]);
    });

    it('inscription portant A pour une personne ou un projet de B : rien', async () => {
      const enrolled = (userId: string, projectId: string) =>
        envelope('member.enrolled', A.id, {
          enrollmentId: crypto.randomUUID(),
          projectId,
          userId,
          isNewAccount: false,
        });
      await consumer.handle(enrolled(USERS.fatou, PROJECTS.a));
      await consumer.handle(enrolled(USERS.moussa, PROJECTS.b));
      expect(await rows()).toEqual([]);
    });

    it('réinitialisation portant B pour une personne qui n’y est pas souscriptrice : rien', async () => {
      await consumer.handle(
        envelope('password_reset.requested', B.id, {
          requestId: crypto.randomUUID(),
          userId: USERS.moussa,
          associationIds: [B.id],
          space: 'subscriber',
        }),
      );
      expect(await rows()).toEqual([]);
    });

    it('compte activé listant une association où la personne n’est que gestionnaire : rien', async () => {
      await consumer.handle(envelope('user.activated', null, { userId: USERS.aminata, associationIds: [A.id] }));
      expect(await rows()).toEqual([]);
    });

    it('regroupement par association : 5 déclarations chez A ne regroupent pas la première de B', async () => {
      // Aminata gère aussi B le temps du test.
      await f.h.superuser(
        `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
         VALUES (gen_random_uuid(), $1, $2, 'manager', 'active', now())`,
        [B.id, USERS.aminata],
      );
      try {
        for (let i = 0; i < 5; i++) {
          const id = await payment('pending');
          await consumer.handle(
            envelope('payment.declared', A.id, {
              paymentId: id,
              projectId: PROJECTS.a,
              userId: USERS.moussa,
              amount: 25_000,
            }),
          );
        }
        const theirs = await payment('pending', B.id);
        await consumer.handle(
          envelope('payment.declared', B.id, {
            paymentId: theirs,
            projectId: PROJECTS.b,
            userId: USERS.fatou,
            amount: 25_000,
          }),
        );
        const inB = (await rows()).filter((r) => r.user_id === USERS.aminata && r.association_id === B.id);
        expect(inB).toEqual([expect.objectContaining({ title: 'Nouvelle déclaration de paiement' })]);
      } finally {
        await f.h.superuser(`DELETE FROM memberships WHERE association_id = $1 AND user_id = $2 AND role = 'manager'`, [
          B.id,
          USERS.aminata,
        ]);
      }
    });
  });

  describe('écriture de la cloche', () => {
    it('le canal in_app écrit en espace system ; le même appel en espace association est refusé par RLS', async () => {
      const router = worker.get(NotificationRouter);
      const db = worker.get(TenantDatabase);
      const msg = paymentValidatedMessage({
        paymentId: crypto.randomUUID(),
        projectId: PROJECTS.a,
        projectName: 'Centre communautaire',
        amount: Money.of(25_000, 'XOF'),
      });
      const recipient = { userId: USERS.moussa, associationId: A.id, audience: 'subscriber' as const };
      await expect(
        db.withTenantContext({ space: 'association', associationId: A.id }, () =>
          router.dispatch(msg, [recipient], { dedupeBase: 'rls-test' }),
        ),
      ).rejects.toThrow();
      expect(await rows()).toEqual([]);
      await db.withTenantContext({ space: 'system' }, () =>
        router.dispatch(msg, [recipient], { dedupeBase: 'rls-test' }),
      );
      expect(await usersOf()).toEqual([USERS.moussa]);
    });
  });
});
