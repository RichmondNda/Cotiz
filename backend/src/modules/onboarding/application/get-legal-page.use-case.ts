import { Injectable } from '@nestjs/common';
import type { LegalPage } from '@cotiz/contracts';
import { DomainProblem } from '../../../shared/http/index.js';
import { LegalDocuments } from '../infra/legal-documents.js';

/** pub.legal : CGU, confidentialité, mentions ; page inconnue → 404 (l'adresse n'existe pas, ce n'est pas une saisie). */
@Injectable()
export class GetLegalPageUseCase {
  constructor(private readonly documents: LegalDocuments) {}

  execute(slug: string): LegalPage {
    const page = this.documents.find(slug);
    if (!page) throw new DomainProblem('not_found');
    return page;
  }
}
