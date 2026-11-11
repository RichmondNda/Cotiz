import { Module } from '@nestjs/common';
import { RedisModule } from '../../shared/redis/redis.module.js';
import {
  CountUnreadNotificationsUseCase,
  ListNotificationsUseCase,
} from './application/list-notifications.use-case.js';
import { ReadAllNotificationsUseCase, ReadNotificationUseCase } from './application/read-notifications.use-case.js';
import {
  GetNotificationPreferencesUseCase,
  ReplaceNotificationPreferencesUseCase,
} from './application/notification-preferences.use-case.js';
import {
  SubscribePushUseCase,
  UnsubscribePushUseCase,
  VapidPublicKeyUseCase,
} from './application/push-subscriptions.use-case.js';
import { StreamNotificationsUseCase } from './application/stream-notifications.use-case.js';
import { NotificationsController } from './http/notifications.controller.js';
import { PreferencesController } from './http/preferences.controller.js';
import { PushController } from './http/push.controller.js';
import { NotificationStreamHub } from './infra/notification-bus.js';
import { IdentityModule } from '../identity/identity.public.js';
import { UnreadCounter } from './infra/unread-counter.js';

/** Partie api du module notifications : nt.list (+ compteur en cache Redis) et nt.read (lot 2.5), nt.stream, me.push et me.prefs (4.2). */
@Module({
  imports: [RedisModule, IdentityModule],
  controllers: [NotificationsController, PushController, PreferencesController],
  providers: [
    UnreadCounter,
    ListNotificationsUseCase,
    CountUnreadNotificationsUseCase,
    ReadNotificationUseCase,
    ReadAllNotificationsUseCase,
    NotificationStreamHub,
    StreamNotificationsUseCase,
    VapidPublicKeyUseCase,
    SubscribePushUseCase,
    UnsubscribePushUseCase,
    GetNotificationPreferencesUseCase,
    ReplaceNotificationPreferencesUseCase,
  ],
})
export class NotificationsModule {}
