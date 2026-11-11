import { Inject, Injectable } from '@nestjs/common';
import type { NotificationPreferences } from '@cotiz/contracts';
import { notificationPreferences as t } from '@cotiz/db';
import { eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { adjustableChannelsOf, MANDATORY_IN_APP_TYPES, NOTIFICATION_TYPES } from '../domain/matrix.js';

type Preferences = z.infer<typeof NotificationPreferences>;
type Channel = 'in_app' | 'push';

/** Canaux proposés : la cloche, et le push quand les clés VAPID sont là (sms et email : groupe 6, non livrés). */
function availableChannels(config: Config): Channel[] {
  return config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY ? ['in_app', 'push'] : ['in_app'];
}

/** Réglages offerts : chaque type notifié × ses canaux de la matrice parmi les canaux proposés. */
function offered(config: Config): { type: string; channel: Channel }[] {
  const available = availableChannels(config);
  return NOTIFICATION_TYPES.flatMap((type) =>
    adjustableChannelsOf(type)
      .filter((channel) => available.includes(channel))
      .map((channel) => ({ type, channel })),
  );
}

const forced = (type: string, channel: Channel) => channel === 'in_app' && MANDATORY_IN_APP_TYPES.has(type);

/**
 * me.prefs › get : réglages de la personne, un par type notifié et canal proposé. Sans ligne enregistrée : activé ;
 * cloche d'un type « action requise » : toujours activée (l'écran grise l'interrupteur). RLS owner_access + filtre.
 */
@Injectable()
export class GetNotificationPreferencesUseCase {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  async execute(): Promise<Preferences> {
    const { userId } = requireActor();
    const rows = await currentTx()
      .select({ type: t.type, channel: t.channel, enabled: t.enabled })
      .from(t)
      .where(eq(t.userId, userId));
    const stored = new Map(rows.map((r) => [`${r.type}:${r.channel}`, r.enabled]));
    return {
      items: offered(this.config).map(({ type, channel }) => ({
        type,
        channel,
        enabled: forced(type, channel) || (stored.get(`${type}:${channel}`) ?? true),
      })),
      availableChannels: availableChannels(this.config),
    };
  }
}

/**
 * me.prefs › replace : enregistre les réglages envoyés (les autres restent tels quels). Type ou canal non proposé :
 * 422 `validation_failed` (`fields.items.<n>`), rien n'est enregistré. Cloche d'un type « action requise » : jamais
 * coupée (le réglage envoyé est ignoré). Réponse : l'état complet, comme get.
 */
@Injectable()
export class ReplaceNotificationPreferencesUseCase {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly get: GetNotificationPreferencesUseCase,
  ) {}

  async execute(input: Pick<Preferences, 'items'>): Promise<Preferences> {
    const { userId } = requireActor();
    const allowed = new Set(offered(this.config).map(({ type, channel }) => `${type}:${channel}`));
    const fields: Record<string, string> = {};
    input.items.forEach((item, i) => {
      if (!allowed.has(`${item.type}:${item.channel}`)) fields[`items.${String(i)}`] = 'unknown_preference';
    });
    if (Object.keys(fields).length > 0) throw new DomainProblem('validation_failed', { fields });
    // Dernière valeur envoyée pour un même réglage ; la cloche obligatoire n'est jamais enregistrée coupée.
    const values = new Map<string, { userId: string; type: string; channel: Channel; enabled: boolean }>();
    for (const item of input.items) {
      const channel = item.channel as Channel;
      values.set(`${item.type}:${channel}`, {
        userId,
        type: item.type,
        channel,
        enabled: item.enabled || forced(item.type, channel),
      });
    }
    if (values.size > 0) {
      await currentTx()
        .insert(t)
        .values([...values.values()])
        .onConflictDoUpdate({ target: [t.userId, t.type, t.channel], set: { enabled: sql`excluded.enabled` } });
    }
    return this.get.execute();
  }
}
