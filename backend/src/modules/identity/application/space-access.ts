import { Inject, Injectable } from '@nestjs/common';
import type { SessionSpace } from '@cotiz/contracts';
import type { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { holdsMembership, type MembershipStatus, platformRoleOf } from '../../access/access.public.js';
import { parseIpAllowList } from '../../../shared/net/index.js';
import { currentRequestInfo } from '../../../shared/request-info/index.js';

/**
 * Droit d'ouvrir ou de prolonger une session dans un espace, vérifié à la connexion ET à chaque renouvellement (un
 * membre retiré, ou une adresse hors liste, ne prolonge plus sa session). Plateforme : personnel de la plateforme,
 * depuis une adresse autorisée (PLATFORM_ALLOWED_IPS). Association : appartenance owner, manager ou viewer ;
 * souscripteur : appartenance souscripteur ; `active` (connexion), ou aussi `invited` pour activer son compte. Dans
 * la transaction du cas d'usage appelant ; appartenances lues « de soi ».
 */
@Injectable()
export class SpaceAccess {
  private readonly platformIpAllowed: ((ip: string | null) => boolean) | null;

  constructor(@Inject(CONFIG) config: Config) {
    this.platformIpAllowed =
      config.PLATFORM_ALLOWED_IPS === undefined ? null : parseIpAllowList(config.PLATFORM_ALLOWED_IPS);
  }

  async allows(
    userId: string,
    space: z.infer<typeof SessionSpace>,
    statuses: readonly MembershipStatus[] = ['active'],
  ): Promise<boolean> {
    if (space !== 'platform') return holdsMembership(userId, space, statuses);
    if (this.platformIpAllowed && !this.platformIpAllowed(currentRequestInfo()?.ip ?? null)) return false;
    return (await platformRoleOf(userId)) !== null;
  }
}
