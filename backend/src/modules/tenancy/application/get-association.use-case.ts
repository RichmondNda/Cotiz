import { Injectable } from '@nestjs/common';
import type { PlatformAssociationDetail } from '@cotiz/contracts';
import { platformAssociationDetail } from './association-views.js';

/** pf.asso.get : fiche plateforme d'une association (sa-association-detail). Connexion plateforme ; 404 si inconnue. */
@Injectable()
export class GetAssociationUseCase {
  execute(id: string): Promise<PlatformAssociationDetail> {
    return platformAssociationDetail(id);
  }
}
