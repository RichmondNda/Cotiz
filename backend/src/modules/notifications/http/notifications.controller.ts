import { Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ENDPOINTS, IdParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import {
  CountUnreadNotificationsUseCase,
  ListNotificationsUseCase,
} from '../application/list-notifications.use-case.js';
import { ReadAllNotificationsUseCase, ReadNotificationUseCase } from '../application/read-notifications.use-case.js';

const ListQuery = ENDPOINTS['nt.list'].operations.list.request.query;

/** nt.list et nt.read — permission `authenticated` ; la cloche de la personne, dans l'espace de son jeton. */
@Controller('me/notifications')
export class NotificationsController {
  constructor(
    private readonly list: ListNotificationsUseCase,
    private readonly unread: CountUnreadNotificationsUseCase,
    private readonly readOne: ReadNotificationUseCase,
    private readonly readAll: ReadAllNotificationsUseCase,
  ) {}

  @Get()
  @Endpoint('nt.list', 'list')
  @Can('authenticated')
  @Header('Cache-Control', 'no-store')
  index(@Query() query: unknown) {
    return this.list.execute(parseInput(ListQuery, query));
  }

  @Get('unread-count')
  @Endpoint('nt.list', 'unreadCount')
  @Can('authenticated')
  @Header('Cache-Control', 'no-store')
  unreadCount() {
    return this.unread.execute();
  }

  @Post('read-all')
  @Endpoint('nt.read', 'readAll')
  @Can('authenticated')
  @HttpCode(200)
  markAllRead() {
    return this.readAll.execute();
  }

  @Post(':id/read')
  @Endpoint('nt.read', 'read')
  @Can('authenticated')
  @HttpCode(200)
  markRead(@Param() params: unknown) {
    return this.readOne.execute(parseInput(IdParams, params).id);
  }
}
