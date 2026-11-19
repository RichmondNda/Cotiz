import { Injectable } from '@nestjs/common';
import { BulkEnrollmentRow, type BulkEnrollmentReport } from '@cotiz/contracts';
import type { z } from 'zod';
import { type PreparedCode, SubscriberAccounts } from '../../identity/identity.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, parseInput } from '../../../shared/http/index.js';
import { afterCommit, type AfterCommit, type InContext } from '../../../shared/tenant-context/index.js';
import { CreateEnrollmentUseCase } from './create-enrollment.use-case.js';
import { contextAssociationId } from './member-context.js';

type Report = z.infer<typeof BulkEnrollmentReport>;
type Line = Report['results'][number];

/**
 * Codes hachés d'avance (Q11) : quatre en cours au plus, autant que de fils de libuv par défaut. Tout hacher d'emblée
 * saturait le processeur et ralentissait d'autant les premières lignes (mesuré : 140 ms au lieu de 22 ms).
 */
const LOOKAHEAD = 4;

/**
 * en.bulk (≤ 200 lignes, Q11) : chaque ligne passe par le cas d'usage unitaire (en.create), dans sa propre transaction
 * après celle de la requête (afterCommit) : une ligne refusée n'annule pas les autres, le quota est contrôlé ligne par
 * ligne, rien ne reste verrouillé pendant tout le lot. Ligne invalide : rapportée (`validation_failed`, champs), les
 * autres sont traitées. Codes d'activation tirés et hachés d'avance pendant que les lignes avancent (PreparedCodes) ;
 * ils restent hors du rapport (« Codes à remettre »). Audit : une entrée par inscription (en.create), plus un bilan du
 * lot.
 *
 * Idempotency-Key : le verrou « en cours » dure 60 s (≈ 6 s mesurées pour 200 lignes). Au-delà, ou après une erreur
 * imprévue en cours de lot (clé abandonnée, lignes déjà validées conservées), un renvoi refait le lot : sans doublon
 * (verrous du cas d'usage unitaire), les lignes déjà faites ressortent `already_enrolled`.
 */
@Injectable()
export class BulkEnrollUseCase {
  constructor(
    private readonly enrollments: CreateEnrollmentUseCase,
    private readonly accounts: SubscriberAccounts,
  ) {}

  async execute(aid: string, input: { projectId: string; rows: unknown[] }): Promise<AfterCommit<Report>> {
    const associationId = contextAssociationId(aid);
    // Projet d'une autre association ou inconnu : 404 pour tout le lot, avant d'écrire quoi que ce soit.
    if (!(await projectOf(associationId, input.projectId))) throw new DomainProblem('not_found');

    return afterCommit(async (inContext) => {
      const codes = new PreparedCodes(() => this.accounts.prepareActivation(), LOOKAHEAD);
      const results: Line[] = [];
      for (const [index, raw] of input.rows.entries()) {
        results.push(await this.line(inContext, aid, input.projectId, index, raw, codes));
      }
      const tally = (outcome: Line['outcome']) => results.filter((r) => r.outcome === outcome).length;
      await inContext(() =>
        this.audit({
          projectId: input.projectId,
          rows: results.length,
          enrolled: tally('enrolled'),
          attached: tally('attached'),
          alreadyEnrolled: tally('already_enrolled'),
          failed: tally('failed'),
        }),
      );
      return { results, newAccounts: tally('enrolled') };
    });
  }

  private async line(
    inContext: InContext,
    aid: string,
    projectId: string,
    index: number,
    raw: unknown,
    codes: PreparedCodes,
  ): Promise<Line> {
    try {
      const row = parseInput(BulkEnrollmentRow, raw);
      const { created, isNewAccount } = await inContext(() =>
        this.enrollments.enroll(aid, projectId, row, { activationCode: () => codes.take() }),
      );
      const outcome = isNewAccount ? 'enrolled' : 'attached';
      return { index, outcome, enrollmentId: created.enrollment.id, errorCode: null, fields: null };
    } catch (error) {
      // Erreur imprévue (base, programmation) : la requête échoue, les lignes déjà validées le restent.
      if (!(error instanceof DomainProblem)) throw error;
      const outcome = error.code === 'already_enrolled' ? 'already_enrolled' : 'failed';
      return { index, outcome, enrollmentId: null, errorCode: error.code, fields: error.details.fields ?? null };
    }
  }

  @Audited('enrollment.bulk')
  private audit(summary: Record<string, unknown> & { projectId: string }): Promise<void> {
    // Bilan sans identité ni téléphone : les inscriptions sont auditées une à une par en.create.
    recordAudit({ entityType: 'project', entityId: summary.projectId, after: summary });
    return Promise.resolve();
  }
}

/**
 * Réserve de codes hachés d'avance : `size` en préparation, chaque prise en relance un. Un code préparé mais jamais pris
 * (fin du lot) est simplement perdu.
 */
export class PreparedCodes {
  private readonly queue: Promise<PreparedCode>[] = [];

  constructor(
    private readonly prepare: () => Promise<PreparedCode>,
    private readonly size: number,
  ) {
    while (this.queue.length < size) this.queue.push(this.start());
  }

  take(): Promise<PreparedCode> {
    const next = this.queue.shift() ?? this.start();
    this.queue.push(this.start());
    return next;
  }

  private start(): Promise<PreparedCode> {
    const code = this.prepare();
    // Peut n'être jamais attendu : un échec ne doit pas devenir un rejet non traité (il ressortira à la prise).
    code.catch(() => undefined);
    return code;
  }
}
