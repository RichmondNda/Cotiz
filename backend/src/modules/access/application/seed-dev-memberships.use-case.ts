import { Inject, Injectable } from '@nestjs/common';
import { memberships } from '@cotiz/db';
import { CONFIG, type Config } from '../../../config.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, mockId, REFERENCE_CROWD } from '../../../shared/dev-seed/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { MembershipRole } from './memberships.js';

/**
 * Appartenances des comptes de développement (identity) aux associations de référence (tenancy), comme les données
 * simulées du front (frontend/server/mocks/db/seed.ts) : Awa owner (trésorière) et souscriptrice d'Entraide Yopougon ;
 * Moussa souscripteur d'Entraide et de Man ; Jean et Fatou souscripteurs d'Entraide. Fatou n'est pas activée : son
 * appartenance est active comme dans les données simulées (connexion après activation, décision 25). Relecteurs des
 * paiements de référence (comptes désactivés) : Aminata, gestionnaire retirée d'Entraide ; le responsable, owner de Man.
 */
const REFERENCE_MEMBERSHIPS: readonly {
  association: string;
  user: string;
  role: MembershipRole;
  title?: string;
  joinedAt: string;
  removed?: true;
}[] = [
  { association: 'entraide-yopougon', user: 'awa-kone', role: 'owner', title: 'trésorière', joinedAt: '2024-02-03' },
  { association: 'entraide-yopougon', user: 'awa-kone', role: 'subscriber', joinedAt: '2026-03-12' },
  { association: 'entraide-yopougon', user: 'moussa-diarra', role: 'subscriber', joinedAt: '2024-02-03' },
  { association: 'entraide-yopougon', user: 'jean-kouassi', role: 'subscriber', joinedAt: '2026-03-12' },
  { association: 'entraide-yopougon', user: 'fatou-traore', role: 'subscriber', joinedAt: '2026-09-02' },
  { association: 'entraide-yopougon', user: 'ibrahim-toure', role: 'subscriber', joinedAt: '2026-09-15' },
  { association: 'ressortissants-man', user: 'moussa-diarra', role: 'subscriber', joinedAt: '2026-07-01' },
  { association: 'entraide-yopougon', user: 'aminata-konate', role: 'manager', joinedAt: '2024-02-03', removed: true },
  { association: 'ressortissants-man', user: 'responsable-man', role: 'owner', joinedAt: '2025-01-14' },
];

/**
 * CLI `seed-dev` (lot 1.2) : appartenances de référence, actives (sauf celle d'Aminata, retirée). Lignes de plusieurs associations : espace platform,
 * connexion plateforme. Idempotente : une appartenance retirée en local reprend son état de référence. Refusée hors développement
 * et test, et sans COTIZ_DEV_SEED=1.
 */
@Injectable()
export class SeedDevMembershipsUseCase {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Audited('membership.seed_dev')
  async execute(): Promise<void> {
    assertDevSeedAllowed(this.config);
    // Souscripteurs de démonstration (shared/dev-seed/reference-crowd.ts) : appartenance active à leur association.
    const crowd = REFERENCE_CROWD.map((p) => ({
      association: p.association,
      user: p.key,
      role: 'subscriber' as const,
      joinedAt: p.joined,
      title: undefined,
      removed: undefined,
    }));
    for (const m of [...REFERENCE_MEMBERSHIPS, ...crowd]) {
      const id = mockId('membership', `${m.association}:${m.user}:${m.role}`);
      const associationId = mockId('association', m.association);
      // Retrait sans date dans les données simulées : aucune n'est inventée.
      const state = {
        status: m.removed ? ('removed' as const) : ('active' as const),
        removedAt: null,
        title: m.title ?? null,
      };
      await currentTx()
        .insert(memberships)
        .values({
          id,
          associationId,
          userId: mockId('user', m.user),
          role: m.role,
          joinedAt: new Date(`${m.joinedAt}T09:00:00Z`),
          ...state,
        })
        .onConflictDoUpdate({ target: [memberships.associationId, memberships.userId, memberships.role], set: state });
      recordAudit({ entityType: 'membership', entityId: id, associationId, after: { role: m.role, seed: 'dev' } });
    }
  }
}
