import { Injectable } from '@nestjs/common';
import type { SessionSpace } from '@cotiz/contracts';
import type { z } from 'zod';
import { holdsMembership, type MembershipStatus, platformRoleOf } from '../../access/access.public.js';

/**
 * Droit d'ouvrir ou de prolonger une session dans un espace, vérifié à la connexion ET à chaque renouvellement (un
 * membre retiré ne prolonge plus sa session). Plateforme : personnel de la plateforme (second facteur exigé à la
 * connexion, lot 4.7 : la liste d'adresses PLATFORM_ALLOWED_IPS de la V1 est retirée). Association : appartenance owner, manager ou viewer ;
 * souscripteur : appartenance souscripteur ; `active` (connexion), ou aussi `invited` pour activer son compte. Dans
 * la transaction du cas d'usage appelant ; appartenances lues « de soi ».
 */
@Injectable()
export class SpaceAccess {
  async allows(
    userId: string,
    space: z.infer<typeof SessionSpace>,
    statuses: readonly MembershipStatus[] = ['active'],
  ): Promise<boolean> {
    if (space !== 'platform') return holdsMembership(userId, space, statuses);
    return (await platformRoleOf(userId)) !== null;
  }
}
