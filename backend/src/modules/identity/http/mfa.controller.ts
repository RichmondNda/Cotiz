import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { type AccessToken, authMfa, MfaVerifyRequest } from '@cotiz/contracts';
import type { z } from 'zod';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { AfterCommit } from '../../../shared/tenant-context/index.js';
import { ConfirmTotpUseCase } from '../application/confirm-totp.use-case.js';
import { EnrollTotpUseCase } from '../application/enroll-totp.use-case.js';
import { VerifyMfaUseCase } from '../application/verify-mfa.use-case.js';
import { authenticatedSession, BearerSessionGuard } from './jwt.guard.js';
import { type CookieResponse, setRefreshCookie } from './refresh-cookie.js';

type Enrollment = z.infer<typeof authMfa.operations.enroll.response.body>;
type Confirmation = z.infer<typeof authMfa.operations.confirm.response.body>;

/**
 * Second facteur TOTP (auth.mfa, lot 4.7). `verify` termine la connexion plateforme (jeton de second facteur) ;
 * `enroll` et `confirm` exigent la session de la personne (BearerSessionGuard), restreinte ou non.
 */
@Controller()
export class MfaController {
  constructor(
    private readonly verifyUseCase: VerifyMfaUseCase,
    private readonly enrollUseCase: EnrollTotpUseCase,
    private readonly confirmUseCase: ConfirmTotpUseCase,
  ) {}

  @Post('auth/mfa/verify')
  @Endpoint('auth.mfa', 'verify')
  @Can('public')
  @HttpCode(200)
  async verify(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AccessToken | AfterCommit<never>> {
    const result = await this.verifyUseCase.execute(parseInput(MfaVerifyRequest, body));
    if (result instanceof AfterCommit) return result;
    setRefreshCookie(res, result.refreshToken, result.rememberMe ? result.refreshMaxAgeMs : null);
    return { accessToken: result.accessToken, expiresAt: result.expiresAt.toISOString(), space: result.space };
  }

  @Post('me/mfa/totp')
  @Endpoint('auth.mfa', 'enroll')
  @Can('public')
  @UseGuards(BearerSessionGuard)
  @HttpCode(201)
  enroll(@Req() req: object): Promise<Enrollment> {
    const session = authenticatedSession(req);
    return this.enrollUseCase.execute({ userId: session.sub, space: session.space });
  }

  /** Les codes de secours ne sont affichés qu'une fois. */
  @Post('me/mfa/totp/confirm')
  @Endpoint('auth.mfa', 'confirm')
  @Can('public')
  @UseGuards(BearerSessionGuard)
  @HttpCode(200)
  confirm(@Req() req: object, @Body() body: unknown): Promise<AfterCommit<Confirmation> | AfterCommit<never>> {
    const session = authenticatedSession(req);
    const input = parseInput(authMfa.operations.confirm.request.body, body);
    return this.confirmUseCase.execute({
      userId: session.sub,
      sessionId: session.sid,
      space: session.space,
      code: input.code,
    });
  }
}
