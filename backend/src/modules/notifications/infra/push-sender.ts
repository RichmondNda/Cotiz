import { Inject, Injectable } from '@nestjs/common';
import webpush from 'web-push';
import { CONFIG, type Config } from '../../../config.js';
import { webPushConfigured } from '../../../shared/features/index.js';
import { isAllowedPushEndpoint, type PushEndpointPolicy, pushEndpointPolicy } from '../domain/push-endpoint.js';

/** Abonnement d'un appareil (protocole Web Push, RFC 8030). */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Contenu chiffré pour l'appareil (RFC 8291) : affiché par le service worker du front. */
export interface PushPayload {
  title: string;
  body: string;
  /** Route front de l'écran d'action, ouverte au clic. */
  url: string | null;
  /** Type de notification : regroupe les notifications d'un même type sur l'appareil. */
  tag: string;
}

/**
 * Résultat d'un envoi : `sent` (accepté par le service de push), `gone` (abonnement expiré : 404/410, à révoquer),
 * `failed` (autre refus ou service injoignable : compté, repris).
 */
export type PushOutcome = { kind: 'sent' } | { kind: 'gone'; status: number } | { kind: 'failed'; reason: string };

export interface PushSender {
  readonly configured: boolean;
  readonly publicKey: string | null;
  send(target: PushTarget, payload: PushPayload, options: { urgent: boolean }): Promise<PushOutcome>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** Durée de conservation d'un message par le service de push quand l'appareil est éteint. */
const TTL_SECONDS = 24 * 3600;

/**
 * Expéditeur Web Push standard (bibliothèque `web-push`, clés VAPID de Cotiz) : les services de push des navigateurs
 * ne sont qu'un transport chiffré, sans compte ni contrat (architecture/00). Sans clés : non configuré, aucun envoi.
 */
@Injectable()
export class WebPushSender implements PushSender {
  readonly configured: boolean;
  readonly publicKey: string | null;
  private readonly policy: PushEndpointPolicy;

  constructor(@Inject(CONFIG) private readonly config: Config) {
    this.policy = pushEndpointPolicy(config);
    this.publicKey = config.VAPID_PUBLIC_KEY ?? null;
    this.configured = webPushConfigured(config);
  }

  async send(target: PushTarget, payload: PushPayload, options: { urgent: boolean }): Promise<PushOutcome> {
    const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = this.config;
    if (!publicKey || !privateKey) return { kind: 'failed', reason: 'not_configured' };
    // Liste des services changée depuis l'abonnement : jamais d'appel hors liste, l'abonnement est désactivé.
    if (!isAllowedPushEndpoint(target.endpoint, this.policy)) return { kind: 'gone', status: 0 };
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: TTL_SECONDS,
          urgency: options.urgent ? 'high' : 'normal',
          timeout: 10_000,
        },
      );
      return { kind: 'sent' };
    } catch (error) {
      const status = error instanceof webpush.WebPushError ? error.statusCode : undefined;
      if (status === 404 || status === 410) return { kind: 'gone', status };
      // Code seulement : ni l'URL de l'appareil (secrète), ni le corps de la réponse.
      return { kind: 'failed', reason: status === undefined ? 'unreachable' : `http_${String(status)}` };
    }
  }
}
