import { Body, Controller, Get, Header, HttpCode, Put, Req } from '@nestjs/common';
import { type Me, meProfile } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import type { AfterCommit } from '../../../shared/tenant-context/index.js';
import { ChangePasswordUseCase } from '../application/change-password.use-case.js';
import { GetMeUseCase } from '../application/get-me.use-case.js';
import { authenticatedSession } from './jwt.guard.js';

/**
 * `me` : la personne connectée (espace me). `me.profile › changePassword` aussi (le profil lui-même, qui lit l'adresse
 * du profil de souscripteur, est servi par le module members : `members/http/me-profile.controller.ts`).
 */
@Controller('me')
export class MeController {
  constructor(
    private readonly getMe: GetMeUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
  ) {}

  /** Propre à la personne et à sa session : jamais mis en cache. */
  @Get()
  @Endpoint('me', 'get')
  @Can('authenticated')
  @Header('Cache-Control', 'no-store')
  get(): Promise<Me> {
    return this.getMe.execute();
  }

  /** La session du jeton est gardée, les autres connexions révoquées. */
  @Put('password')
  @Endpoint('me.profile', 'changePassword')
  @Can('authenticated')
  @HttpCode(204)
  changePassword(@Req() req: object, @Body() body: unknown): Promise<AfterCommit<void>> {
    const input = parseInput(meProfile.operations.changePassword.request.body, body);
    return this.changePasswordUseCase.execute({ sessionId: authenticatedSession(req).sid, ...input });
  }
}
