import type { IncomingMessage, ServerResponse } from 'node:http';
import { Controller, Get, Header, Headers, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ENDPOINTS, IdParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import {
  CountUnreadNotificationsUseCase,
  ListNotificationsUseCase,
} from '../application/list-notifications.use-case.js';
import { ReadAllNotificationsUseCase, ReadNotificationUseCase } from '../application/read-notifications.use-case.js';
import { type SseSink, StreamNotificationsUseCase } from '../application/stream-notifications.use-case.js';
import { authenticatedSession } from '../../identity/identity.public.js';

const ListQuery = ENDPOINTS['nt.list'].operations.list.request.query;

/** nt.list et nt.read — permission `authenticated` ; la cloche de la personne, dans l'espace de son jeton. */
@Controller('me/notifications')
export class NotificationsController {
  constructor(
    private readonly list: ListNotificationsUseCase,
    private readonly unread: CountUnreadNotificationsUseCase,
    private readonly readOne: ReadNotificationUseCase,
    private readonly readAll: ReadAllNotificationsUseCase,
    private readonly streamNotifications: StreamNotificationsUseCase,
  ) {}

  /**
   * nt.stream (lot 4.2) : flux SSE. Réponse écrite à la main (Nest n'envoie rien : `@Res()`) ; le cas d'usage rend la
   * main après la transaction de la requête (afterCommit), le flux ne tient donc aucune connexion à la base.
   */
  @Get('stream')
  @Endpoint('nt.stream', 'stream')
  @Can('authenticated')
  stream(
    @Req() req: IncomingMessage,
    @Res() res: ServerResponse,
    @Headers('last-event-id') lastEventId: string | undefined,
  ) {
    const sink: SseSink = {
      open: () => {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
          // Proxy (Traefik, Nitro) : pas de mise en tampon du flux.
          'x-accel-buffering': 'no',
        });
        res.flushHeaders();
      },
      write: (chunk) => {
        if (!res.writableEnded) res.write(chunk);
      },
      end: () => {
        if (!res.writableEnded) res.end();
      },
      onClose: (listener) => {
        res.once('close', listener);
      },
    };
    const { sid, exp } = authenticatedSession(req);
    return this.streamNotifications.execute({ lastEventId, session: { sid, exp }, sink });
  }

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
