import { Module } from '@nestjs/common';
import { RedisModule } from '../../shared/redis/redis.module.js';
import {
  CountUnreadNotificationsUseCase,
  ListNotificationsUseCase,
} from './application/list-notifications.use-case.js';
import { ReadAllNotificationsUseCase, ReadNotificationUseCase } from './application/read-notifications.use-case.js';
import { NotificationsController } from './http/notifications.controller.js';
import { UnreadCounter } from './infra/unread-counter.js';

/** Partie api du module notifications (lot 2.5) : nt.list (+ compteur en cache Redis) et nt.read. */
@Module({
  imports: [RedisModule],
  controllers: [NotificationsController],
  providers: [
    UnreadCounter,
    ListNotificationsUseCase,
    CountUnreadNotificationsUseCase,
    ReadNotificationUseCase,
    ReadAllNotificationsUseCase,
  ],
})
export class NotificationsModule {}
