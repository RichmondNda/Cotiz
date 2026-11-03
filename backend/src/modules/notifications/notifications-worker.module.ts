import { Module } from '@nestjs/common';
import { NotificationRouter } from './application/notification-router.js';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './domain/channel.js';
import { InAppChannel } from './infra/in-app.channel.js';
import { ManualChannel } from './infra/manual.channel.js';

/**
 * Partie worker du module notifications (lot 2.5, architecture/07) : canaux disponibles dans le processus et routeur.
 * V1 : `in_app` et `manual` seulement ; `push` arrive au lot 4.2, `email` et `sms` au groupe 6 (en option).
 */
@Module({
  providers: [
    InAppChannel,
    ManualChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [InAppChannel, ManualChannel],
      useFactory: (...channels: NotificationChannel[]): NotificationChannel[] => channels,
    },
    NotificationRouter,
  ],
  exports: [NotificationRouter],
})
export class NotificationsWorkerModule {}
