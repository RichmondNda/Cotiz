import { Injectable } from '@nestjs/common';
import type { PersonalDataExport } from '@cotiz/contracts';
import type { z } from 'zod';
import { activeMembershipsOf, platformRoleOf } from '../../access/access.public.js';
import { personalAccountOf } from '../../identity/identity.public.js';
import { type SubscriberPaymentRefs, subscriberPaymentsOf } from '../../ledger/ledger.public.js';
import { MyProfile, subscriberEnrollmentsOf } from '../../members/members.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { currentContext } from '../../../shared/tenant-context/index.js';
import { associationRefOf } from './subscriber-cards.js';

type Export = z.infer<typeof PersonalDataExport>;

const iso = (d: Date | null) => d?.toISOString() ?? null;

/**
 * Inscriptions (retirées comprises) et paiements déclarés de la personne connectée, dans les associations où elle est
 * souscriptrice active — mêmes lectures que me.history (`subscriber*Of` : espace, `userId` et appartenance vérifiés
 * dans le code, en plus de la RLS).
 */
async function subscriberDataOf(): Promise<NonNullable<Export['subscriber']>> {
  const entries = await subscriberEnrollmentsOf({ includeWithdrawn: true });
  const refs: SubscriberPaymentRefs = {
    projects: new Map(entries.map((e) => [e.project.id, { id: e.project.id, name: e.project.name }])),
    associations: new Map(entries.map((e) => [e.association.id, associationRefOf(e)])),
    withdrawnEnrollments: new Set(entries.filter((e) => e.row.status === 'withdrawn').map((e) => e.row.id)),
  };
  return {
    enrollments: entries.map((e) => ({
      id: e.row.id,
      association: { id: e.association.id, name: e.association.name },
      project: { id: e.project.id, name: e.project.name },
      status: e.row.status,
      startsFrom: e.row.startsFrom,
      joinedAt: e.row.joinedAt.toISOString(),
      withdrawnAt: iso(e.row.withdrawnAt),
    })),
    payments: await subscriberPaymentsOf(
      entries.map((e) => e.row.id),
      refs,
    ),
  };
}

/**
 * me.profile › export (lot 4.7) : données de la personne du jeton, jamais d'une autre — profil (adresse comprise),
 * compte, rôle plateforme, appartenances actives, 50 dernières connexions ; en espace souscripteur, inscriptions et
 * paiements déclarés (les paiements ne se lisent que là, RLS `subscriber_self_read`). Ni haché, ni secret, ni code, ni
 * jeton. Module reporting : il lit members et ledger (ledger importe déjà members). Audité (`user.export_data`, sans le
 * contenu exporté).
 */
@Injectable()
export class ExportMyDataUseCase {
  constructor(private readonly profile: MyProfile) {}

  @Audited('user.export_data')
  async execute(now = new Date()): Promise<Export> {
    const { userId } = requireActor();
    const profile = await this.profile.get();
    const personal = await personalAccountOf(userId);
    if (!personal) throw new DomainProblem('session_expired');
    const memberships = await activeMembershipsOf(userId);
    const subscriber = currentContext()?.space === 'subscriber' ? await subscriberDataOf() : null;
    // Association : celle du contexte en espace association (règle de recordAudit), aucune ailleurs.
    recordAudit({ entityType: 'user', entityId: userId, after: { exportedAt: now.toISOString() } });
    return {
      exportedAt: now.toISOString(),
      profile,
      account: {
        status: personal.account.status,
        createdAt: personal.account.createdAt.toISOString(),
        lastLoginAt: iso(personal.account.lastLoginAt),
      },
      platformRole: await platformRoleOf(userId),
      memberships: memberships.map((m) => ({
        association: { id: m.association.id, name: m.association.name },
        role: m.role,
        title: m.title,
        joinedAt: m.joinedAt.toISOString(),
      })),
      sessions: personal.sessions.map((s) => ({
        space: s.space,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: iso(s.lastUsedAt),
        expiresAt: s.expiresAt.toISOString(),
        revokedAt: iso(s.revokedAt),
        ip: s.ip,
        userAgent: s.userAgent,
      })),
      subscriber,
    };
  }
}
