import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ENDPOINTS, IdParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import {
  SubscribePushUseCase,
  UnsubscribePushUseCase,
  VapidPublicKeyUseCase,
} from '../application/push-subscriptions.use-case.js';

const SubscribeBody = ENDPOINTS['me.push'].operations.subscribe.request.body;

/** me.push (lot 4.2) — permission `authenticated` : clé VAPID, abonnement et désabonnement d'un appareil. */
@Controller()
export class PushController {
  constructor(
    private readonly vapidKey: VapidPublicKeyUseCase,
    private readonly subscribePush: SubscribePushUseCase,
    private readonly unsubscribePush: UnsubscribePushUseCase,
  ) {}

  @Get('public/push/vapid-public-key')
  @Endpoint('me.push', 'vapidKey')
  @Can('authenticated')
  @Header('Cache-Control', 'no-store')
  publicKey() {
    return this.vapidKey.execute();
  }

  @Post('me/push-subscriptions')
  @Endpoint('me.push', 'subscribe')
  @Can('authenticated')
  @HttpCode(201)
  subscribe(@Body() body: unknown, @Headers('user-agent') userAgent: string | undefined) {
    return this.subscribePush.execute(parseInput(SubscribeBody, body), userAgent);
  }

  @Delete('me/push-subscriptions/:id')
  @Endpoint('me.push', 'unsubscribe')
  @Can('authenticated')
  @HttpCode(204)
  async unsubscribe(@Param() params: unknown): Promise<void> {
    await this.unsubscribePush.execute(parseInput(IdParams, params).id);
  }
}
