import { Controller, Get, Header } from '@nestjs/common';
import type { Me } from '@cotiz/contracts';
import { Can, Endpoint } from '../../../shared/http/index.js';
import { GetMeUseCase } from '../application/get-me.use-case.js';

/** `me` : la personne connectée (espace me). */
@Controller('me')
export class MeController {
  constructor(private readonly getMe: GetMeUseCase) {}

  /** Propre à la personne et à sa session : jamais mis en cache. */
  @Get()
  @Endpoint('me', 'get')
  @Can('authenticated')
  @Header('Cache-Control', 'no-store')
  get(): Promise<Me> {
    return this.getMe.execute();
  }
}
