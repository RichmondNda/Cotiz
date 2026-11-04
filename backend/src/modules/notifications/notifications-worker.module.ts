import { Module, type OnModuleInit } from '@nestjs/common';
import { RedisModule } from '../../shared/redis/redis.module.js';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { NotificationRouter } from './application/notification-router.js';
import { SendManagersDigestUseCase } from './application/send-managers-digest.use-case.js';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './domain/channel.js';
import { NotificationsConsumer } from './events/notifications.consumer.js';
import { InAppChannel } from './infra/in-app.channel.js';
import { ManualChannel } from './infra/manual.channel.js';
import { UnreadCounter } from './infra/unread-counter.js';

/**
 * Partie worker du module notifications (lot 2.5, architecture/07) : canaux disponibles dans le processus, routeur et
 * consommateur des événements notifiés ; tâche `managers.digest` (lot 2.6, 07:30 locale), lancée toutes les heures à la
 * demie.
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
    SendManagersDigestUseCase,
  ],
  exports: [NotificationRouter, SendManagersDigestUseCase],
})
export class NotificationsWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly digest: SendManagersDigestUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({
      name: 'managers.digest',
      pattern: '30 * * * *',
      run: () => this.digest.execute(new Date()),
    });
  }
}
