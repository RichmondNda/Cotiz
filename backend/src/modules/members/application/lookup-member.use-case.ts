import { Injectable } from '@nestjs/common';
import type { LookupInput, LookupResult } from '@cotiz/contracts';
import type { z } from 'zod';
import { associationsCountOf } from '../../access/access.public.js';
import { accountByPhone } from '../../identity/identity.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { normalizePhone } from '../domain/phone.js';
import { contextAssociationId } from './member-context.js';
import { enrollmentOf } from './enrollment-records.js';

type Input = z.infer<typeof LookupInput>;
type Result = z.infer<typeof LookupResult>;

/**
 * mb.lookup (architecture/04 § 4.3) : un compte a-t-il ce téléphone, et est-il déjà inscrit au projet ? Un compte
 * retrouvé n'est décrit que par son prénom, l'initiale de son nom et un nombre d'associations (Q10) : l'endpoint ne
 * sert pas d'annuaire. Limité en débit par le contrat ; chaque recherche est auditée (téléphone masqué).
 */
@Injectable()
export class LookupMemberUseCase {
  @Audited('member.lookup')
  async execute(aid: string, input: Input): Promise<Result> {
    const associationId = contextAssociationId(aid);
    // Projet d'abord : un projet d'une autre association répond 404 sans rien dire du numéro.
    if (!(await projectOf(associationId, input.projectId))) throw new DomainProblem('not_found');
    const phone = normalizePhone(input.phone);
    if (!phone) throw new DomainProblem('invalid_phone', { fields: { phone: 'invalid_phone' } });

    const account = await accountByPhone(phone);
    const result: Result = !account
      ? { result: 'new' }
      : await (async () => {
          const person = { id: account.id, firstName: account.firstName, lastInitial: account.lastInitial };
          if (await enrollmentOf(input.projectId, account.id)) return { result: 'already_enrolled', person } as const;
          return { result: 'existing_user', person, associationsCount: await associationsCountOf(account.id) } as const;
        })();
    recordAudit({
      entityType: 'user',
      entityId: account?.id ?? null,
      after: { result: result.result, phone, projectId: input.projectId },
    });
    return result;
  }
}
