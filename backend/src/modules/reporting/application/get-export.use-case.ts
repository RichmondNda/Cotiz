import { Injectable } from '@nestjs/common';
import type { ExportJob } from '@cotiz/contracts';
import type { z } from 'zod';
import { contextAssociationId } from '../../members/members.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { exportOf, toExportJob } from './export-records.js';

/**
 * rp.export › get : état d'un export de l'association (suivi après la demande) ; d'une autre association ou inconnu :
 * 404. Prêt (`done`) : `fileId`, lu par `as.file` jusqu'à son expiration (7 jours).
 */
@Injectable()
export class GetExportUseCase {
  async execute(aid: string, id: string): Promise<z.infer<typeof ExportJob>> {
    const job = await exportOf(contextAssociationId(aid), id);
    if (!job) throw new DomainProblem('not_found');
    return toExportJob(job);
  }
}
