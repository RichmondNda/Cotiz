import { Injectable } from '@nestjs/common';
import type { Association } from '@cotiz/contracts';
import { DomainProblem } from '../../../shared/http/index.js';
import { toAssociation } from './association-profile.js';
import { ownAssociationOf } from './association-records.js';

/** as.get : profil et statut d'onboarding de l'association, pour ses gestionnaires (viewer compris). */
@Injectable()
export class GetAssociationProfileUseCase {
  async execute(aid: string): Promise<Association> {
    const row = await ownAssociationOf(aid);
    if (!row) throw new DomainProblem('not_found');
    return toAssociation(row);
  }
}
