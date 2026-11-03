import { Module } from '@nestjs/common';
import { RedisModule } from '../../shared/redis/redis.module.js';
import { NotificationRouter } from './application/notification-router.js';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './domain/channel.js';
import { NotificationsConsumer } from './events/notifications.consumer.js';
import { InAppChannel } from './infra/in-app.channel.js';
import { ManualChannel } from './infra/manual.channel.js';
import { UnreadCounter } from './infra/unread-counter.js';

/**
 * Partie worker du module notifications (lot 2.5, architecture/07) : canaux disponibles dans le processus, routeur et
 * consommateur des événements notifiés.
 * V1 : `in_app` et `manual` seulement ; `push` arrive au lot 4.2, `email` et `sms` au groupe 6 (en option).
 */
@Module({
  imports: [RedisModule],
  providers: [
    UnreadCounter,
    InAppChannel,
    ManualChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [InAppChannel, ManualChannel],
      useFactory: (...channels: NotificationChannel[]): NotificationChannel[] => channels,
    },
    NotificationRouter,
    NotificationsConsumer,
  ],
  exports: [NotificationRouter],
})
export class NotificationsWorkerModule {}
