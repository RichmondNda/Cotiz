import { Inject, Injectable } from '@nestjs/common';
import { contracts } from '@cotiz/db';
import { CONFIG, type Config } from '../../../config.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { assertDevSeedAllowed, mockId } from '../../../shared/dev-seed/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { sha256Of } from './contract-records.js';

/** Modèle des données simulées du front (frontend/server/mocks/db/seed.ts, `CONTRACT_TEMPLATE`). */
const TEMPLATE = [
  '**Entre** l’association {association}, et **{nom_souscripteur}**, souscripteur, joignable au {telephone}.',
  '**Article 1 — Objet.** Le souscripteur s’engage à participer au financement du projet {projet}.',
  '**Article 2 — Montant.** La participation totale est de {montant} CFA : un fonds d’entrée de {fonds_entree}, puis {nb_echeances} échéances {frequence} de {montant_echeance}, payables le {jour} de chaque mois.',
  '**Article 3 — Paiement.** Les versements sont effectués par mobile money ou virement, puis déclarés sur Cotiz. Un paiement n’est acquis qu’après validation par l’association.',
  '**Article 4 — Retard.** [CONDITIONS EN CAS DE RETARD DÉFINIES PAR L’ASSOCIATION]',
  '**Article 5 — Résiliation.** [CONDITIONS DE RÉSILIATION DÉFINIES PAR L’ASSOCIATION]',
].join('\n\n');

interface ReferenceContract {
  projectKey: string;
  signer: { userKey: string; name: string; title: string };
  /** Signé par l'association et verrouillé ce jour-là. */
  lockedOn: string;
}

/**
 * Contrats de docs/specs/seed-reference.yaml (`contractRequired: true`) : Voyage solidaire, signé par la trésorière
 * et verrouillé comme dans les données simulées (Moussa y attend sa signature : « Contrat Voyage solidaire à signer »).
 */
const REFERENCE_CONTRACTS: Readonly<Record<string, readonly ReferenceContract[]>> = {
  'entraide-yopougon': [
    {
      projectKey: 'voyage-solidaire',
      signer: { userKey: 'awa-kone', name: 'Awa Koné', title: 'trésorière' },
      lockedOn: '2026-05-20',
    },
  ],
};

/** Associations qui ont des contrats de référence, à passer une par une à SeedDevContractsUseCase. */
export const REFERENCE_CONTRACT_ASSOCIATIONS = Object.keys(REFERENCE_CONTRACTS);

/**
 * CLI `seed-dev` (PR C, 2026-11-10) : contrats de référence d'une association, dans son contexte, après ses projets.
 * Idempotente : un contrat déjà présent n'est pas modifié. Aucun événement `contract.locked` (pas de notification de
 * développement). Refusée hors développement et test, et sans COTIZ_DEV_SEED=1.
 */
@Injectable()
export class SeedDevContractsUseCase {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Audited('contract.seed_dev')
  async execute(slug: string): Promise<string[]> {
    assertDevSeedAllowed(this.config);
    const associationId = mockId('association', slug);
    const reference = REFERENCE_CONTRACTS[slug] ?? [];
    for (const c of reference) {
      const id = mockId('contract', c.projectKey);
      const lockedAt = new Date(`${c.lockedOn}T09:00:00Z`);
      const created = await currentTx()
        .insert(contracts)
        .values({
          id,
          associationId,
          projectId: mockId('project', c.projectKey),
          bodyTemplate: TEMPLATE,
          templateSha256: sha256Of(TEMPLATE),
          associationSignerName: c.signer.name,
          associationSignerTitle: c.signer.title,
          associationSignedBy: mockId('user', c.signer.userKey),
          associationSignedAt: lockedAt,
          lockedAt,
          createdAt: lockedAt,
        })
        .onConflictDoNothing()
        .returning({ id: contracts.id });
      recordAudit({
        entityType: 'contract',
        entityId: id,
        associationId,
        after: { project: c.projectKey, seed: 'dev', created: created.length > 0 },
      });
    }
    return reference.map((c) => c.projectKey);
  }
}
