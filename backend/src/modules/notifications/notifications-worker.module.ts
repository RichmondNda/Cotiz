import { Module, type OnModuleInit } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { RedisModule } from '../../shared/redis/redis.module.js';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { NotificationRouter } from './application/notification-router.js';
import { PurgePushSubscriptionsUseCase } from './application/purge-push-subscriptions.use-case.js';
import { SendPushUseCase } from './application/send-push.use-case.js';
import { SendManagersDigestUseCase } from './application/send-managers-digest.use-case.js';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './domain/channel.js';
import { NotificationsConsumer } from './events/notifications.consumer.js';
import { NotifyPushProcessor } from './events/notify-push.processor.js';
import { InAppChannel } from './infra/in-app.channel.js';
import { NotificationAnnouncer } from './infra/notification-bus.js';
import { ManualChannel } from './infra/manual.channel.js';
import { PushChannel } from './infra/push.channel.js';
import { PushQueue } from './infra/push-queue.js';
import { PUSH_SENDER, type PushSender, WebPushSender } from './infra/push-sender.js';
import { UnreadCounter } from './infra/unread-counter.js';

/**
 * Partie worker du module notifications (lot 2.5, architecture/07) : canaux disponibles dans le processus, routeur et
 * consommateur des événements notifiés ; tâche `managers.digest` (lot 2.6, 07:30 locale), lancée toutes les heures à la
 * demie.
 * Canaux : `in_app`, `manual` et `push` (lot 4.2 : actif avec les clés VAPID, file `notify-push`, purge hebdomadaire
 * `push.cleanup`) ; `email` et `sms` au groupe 6 (en option).
 */
@Module({
  imports: [RedisModule],
  providers: [
    UnreadCounter,
    NotificationAnnouncer,
    InAppChannel,
    ManualChannel,
    { provide: PUSH_SENDER, inject: [CONFIG], useFactory: (config: Config): PushSender => new WebPushSender(config) },
    PushQueue,
    PushChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [InAppChannel, ManualChannel, PushChannel],
      useFactory: (...channels: NotificationChannel[]): NotificationChannel[] => channels,
    },
    NotificationRouter,
    NotificationsConsumer,
    SendManagersDigestUseCase,
    SendPushUseCase,
    NotifyPushProcessor,
    PurgePushSubscriptionsUseCase,
  ],
  exports: [NotificationRouter, SendManagersDigestUseCase],
})
export class NotificationsWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly digest: SendManagersDigestUseCase,
    private readonly purgePush: PurgePushSubscriptionsUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({
      name: 'managers.digest',
      pattern: '30 * * * *',
      run: () => this.digest.execute(new Date()),
    });
    // Hebdomadaire (jobs.yaml) : le lundi à 04:00, après la maintenance de 03:00.
    this.scheduled.define({
      name: 'push.cleanup',
      pattern: '0 4 * * 1',
      run: async () => {
        await this.purgePush.execute(new Date());
      },
    });
  }
}
