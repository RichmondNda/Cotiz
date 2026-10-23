import { Inject, Injectable } from '@nestjs/common';
import { associationRequests } from '@cotiz/db';
import { inArray, sql } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, mockId } from '../../../shared/dev-seed/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { requestReference } from '../domain/request-reference.js';

type Estimated = '1_20' | '21_50' | '51_200' | '201_500' | '500_plus';
type Status = 'pending' | 'approved' | 'rejected';

interface ReferenceRequest {
  key: string;
  name: string;
  type: string;
  city: string;
  contact: { firstName: string; lastName: string; title: string; email: string };
  estimated: Estimated;
  plan: string;
  receivedAt: string;
  status: Status;
  plannedProjects?: number;
  acquisitionSource?: string;
  activityDescription?: string;
  viewedAt?: string;
  decidedAt?: string;
}

const RESPONSABLE = {
  firstName: '[Responsable]',
  lastName: '',
  title: '[FONCTION]',
  email: 'responsable@domaine.example',
};
const contact = (firstName: string, lastName: string, email: string) => ({
  firstName,
  lastName,
  title: '[FONCTION]',
  email,
});

/**
 * Demandes de création de docs/specs/seed-reference.yaml, comme les données simulées du front
 * (frontend/server/mocks/db/seed.ts, `requests()`) : même identifiant (`uid('request', clé)`), statut, demandeur. Les
 * demandes approuvées pointent vers les associations de référence (SeedDevAssociationsUseCase, lancé avant).
 */
const REFERENCE_REQUESTS: readonly ReferenceRequest[] = [
  {
    key: 'tontine-commercantes-adjame',
    name: 'Tontine des commerçantes d’Adjamé',
    type: 'tontine',
    city: 'Abidjan',
    contact: { firstName: 'Mariam', lastName: 'Ouattara', title: 'Présidente', email: 'm.ouattara@domaine.example' },
    estimated: '51_200',
    plan: 'essentiel',
    receivedAt: '2026-09-21T10:14:00Z',
    status: 'pending',
    plannedProjects: 2,
    acquisitionSource: 'Une autre association',
    activityDescription: '[Description de l’activité saisie par le demandeur — 500 caractères maximum.]',
    viewedAt: '2026-09-25T09:02:00Z',
  },
  {
    key: 'mutuelle-enseignants-daloa',
    name: 'Mutuelle des enseignants de Daloa',
    type: 'mutuelle',
    city: 'Daloa',
    contact: contact('Koffi', 'N’Guessan', 'k.nguessan@domaine.example'),
    estimated: '201_500',
    plan: 'pro',
    receivedAt: '2026-09-22T09:00:00Z',
    status: 'pending',
  },
  {
    key: 'groupement-femmes-korhogo',
    name: 'Groupement des femmes de Korhogo',
    type: 'groupement',
    city: 'Korhogo',
    contact: contact('Salimata', 'Coulibaly', 's.coulibaly@domaine.example'),
    estimated: '21_50',
    plan: 'decouverte',
    receivedAt: '2026-09-23T09:00:00Z',
    status: 'pending',
  },
  {
    key: 'etudiants-yamoussoukro',
    name: 'Association des étudiants de Yamoussoukro',
    type: 'association',
    city: 'Yamoussoukro',
    contact: contact('Yao', 'Kouamé', 'y.kouame@domaine.example'),
    estimated: '51_200',
    plan: 'decouverte',
    receivedAt: '2026-09-24T09:00:00Z',
    status: 'pending',
  },
  {
    key: 'jeunesse-bouake',
    name: 'Jeunesse solidaire de Bouaké',
    type: 'association',
    city: 'Bouaké',
    contact: RESPONSABLE,
    estimated: '21_50',
    plan: 'decouverte',
    receivedAt: '2026-09-20T09:00:00Z',
    status: 'approved',
    decidedAt: '2026-09-24T09:00:00Z',
  },
  {
    key: 'ressortissants-man',
    name: 'Association des ressortissants de Man',
    type: 'association',
    city: 'Abidjan',
    contact: RESPONSABLE,
    estimated: '51_200',
    plan: 'pro',
    receivedAt: '2025-01-14T09:00:00Z',
    status: 'approved',
    decidedAt: '2025-01-14T15:00:00Z',
  },
  {
    key: 'entraide-yopougon',
    name: 'Entraide Yopougon',
    type: 'association',
    city: 'Abidjan',
    contact: contact('Awa', 'Koné', 'awa@entraide.ci'),
    estimated: '51_200',
    plan: 'decouverte',
    receivedAt: '2024-02-03T09:00:00Z',
    status: 'approved',
    decidedAt: '2024-02-03T15:00:00Z',
  },
  {
    key: 'amis-grand-bassam',
    name: 'Club des amis de Grand-Bassam',
    type: 'association',
    city: 'Grand-Bassam',
    contact: RESPONSABLE,
    estimated: '1_20',
    plan: 'decouverte',
    receivedAt: '2026-09-11T09:00:00Z',
    status: 'rejected',
    decidedAt: '2026-09-11T15:00:00Z',
  },
];

/**
 * CLI `seed-dev` (lot 1.3) : demandes de création de référence, en espace platform (connexion plateforme), après les
 * associations, les plans et les comptes. Idempotente : une demande déjà présente (même identifiant) n'est pas
 * modifiée ; une nouvelle prend sa référence dans la séquence des demandes. Refusée hors développement et test, et
 * sans COTIZ_DEV_SEED=1.
 */
@Injectable()
export class SeedDevRequestsUseCase {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Audited('association_request.seed_dev')
  async execute(): Promise<string[]> {
    assertDevSeedAllowed(this.config);
    const tx = currentTx();
    const ids = REFERENCE_REQUESTS.map((r) => mockId('request', r.key));
    const existing = new Set(
      (
        await tx
          .select({ id: associationRequests.id })
          .from(associationRequests)
          .where(inArray(associationRequests.id, ids))
      ).map((r) => r.id),
    );
    const richy = mockId('user', 'richy');
    const created: string[] = [];
    for (const r of REFERENCE_REQUESTS) {
      const id = mockId('request', r.key);
      const known = existing.has(id);
      recordAudit({
        entityType: 'association_request',
        entityId: id,
        associationId: null,
        after: { seed: 'dev', created: !known },
      });
      if (known) continue;
      const sequence = await tx.execute<{ n: string }>(
        sql`SELECT nextval('association_request_number_seq')::text AS n`,
      );
      const number = sequence.rows[0]?.n;
      if (number === undefined) throw new Error('seed-dev : séquence des références illisible');
      const receivedAt = new Date(r.receivedAt);
      const decided = r.status !== 'pending';
      await tx.insert(associationRequests).values({
        id,
        reference: requestReference(receivedAt.getUTCFullYear(), BigInt(number)),
        associationName: r.name,
        associationType: r.type,
        city: r.city,
        country: 'Côte d’Ivoire',
        registrationNumber: null,
        activityDescription: r.activityDescription ?? '[DESCRIPTION]',
        contactFirstName: r.contact.firstName,
        contactLastName: r.contact.lastName,
        contactTitle: r.contact.title,
        contactEmail: r.contact.email,
        contactPhone: '+2250700000000',
        estimatedSubscribers: r.estimated,
        plannedProjects: r.plannedProjects ?? null,
        desiredPlanId: mockId('plan', r.plan),
        acquisitionSource: r.acquisitionSource ?? '[SOURCE]',
        termsAcceptedAt: receivedAt,
        createdAt: receivedAt,
        status: r.status,
        viewedBy: r.viewedAt ? richy : null,
        viewedAt: r.viewedAt ? new Date(r.viewedAt) : null,
        decidedBy: decided ? richy : null,
        decidedAt: r.decidedAt ? new Date(r.decidedAt) : null,
        rejectionReasonCode: r.status === 'rejected' ? 'incomplete' : null,
        associationId: r.status === 'approved' ? mockId('association', r.key) : null,
      });
      created.push(r.key);
    }
    return created;
  }
}
