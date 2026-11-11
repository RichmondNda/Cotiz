import { Module } from '@nestjs/common';
import { RedisModule } from '../../shared/redis/redis.module.js';
import {
  CountUnreadNotificationsUseCase,
  ListNotificationsUseCase,
} from './application/list-notifications.use-case.js';
import { ReadAllNotificationsUseCase, ReadNotificationUseCase } from './application/read-notifications.use-case.js';
import { StreamNotificationsUseCase } from './application/stream-notifications.use-case.js';
import { NotificationsController } from './http/notifications.controller.js';
import { NotificationStreamHub } from './infra/notification-bus.js';
import { IdentityModule } from '../identity/identity.public.js';
import { UnreadCounter } from './infra/unread-counter.js';

/** Partie api du module notifications : nt.list (+ compteur en cache Redis) et nt.read (lot 2.5), nt.stream (4.2). */
@Module({
  imports: [RedisModule, IdentityModule],
  controllers: [NotificationsController],
  providers: [
    UnreadCounter,
    ListNotificationsUseCase,
    CountUnreadNotificationsUseCase,
    ReadNotificationUseCase,
    ReadAllNotificationsUseCase,
    NotificationStreamHub,
    StreamNotificationsUseCase,
  ],
})
export class NotificationsModule {}
