import { Injectable } from '@nestjs/common';
import type { DeliveryResult, NotificationChannel } from '../domain/channel.js';

/**
 * Canal `manual` (architecture/07) : produit un message prêt qu'une personne remet (copier, WhatsApp, `sms:`,
 * impression). Rien n'est envoyé ni écrit : les messages prêts (codes, relances) sont rendus dans la réponse du cas
 * d'usage qui les produit (lots 2.3, 4.3). Toujours actif, aucun fournisseur.
 */
@Injectable()
export class ManualChannel implements NotificationChannel {
  readonly kind = 'manual' as const;

  isEnabled(): Promise<boolean> {
    return Promise.resolve(true);
  }

  send(): Promise<DeliveryResult> {
    return Promise.resolve({ channel: this.kind, status: 'prepared' });
  }
}
