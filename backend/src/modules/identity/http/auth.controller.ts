import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  type AccessToken,
  ActivateRequest,
  ForgotPasswordRequest,
  LoginRequest,
  type LoginResponse,
  ResetPasswordRequest,
  ResetToken,
  VerifyResetCodeRequest,
} from '@cotiz/contracts';
import type { z } from 'zod';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { AfterCommit } from '../../../shared/tenant-context/index.js';
import { ActivateAccountUseCase } from '../application/activate-account.use-case.js';
import { LoginUseCase } from '../application/login.use-case.js';
import type { OpenedSession } from '../application/session-opener.js';
import { LogoutUseCase } from '../application/logout.use-case.js';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case.js';
import { RequestPasswordResetUseCase } from '../application/request-password-reset.use-case.js';
import { ResetPasswordUseCase } from '../application/reset-password.use-case.js';
import { VerifyResetCodeUseCase } from '../application/verify-reset-code.use-case.js';
import { authenticatedSession } from './jwt.guard.js';
import { clearRefreshCookie, type CookieResponse, readRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

/** Corps de la réponse d'une session ouverte ; le jeton de renouvellement part dans le cookie. */
function opened(res: CookieResponse, session: OpenedSession): AccessToken {
  setRefreshCookie(res, session.refreshToken, session.rememberMe ? session.refreshMaxAgeMs : null);
  return { accessToken: session.accessToken, expiresAt: session.expiresAt.toISOString(), space: session.space };
}

/** Authentification (endpoints.yaml, espace auth). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly activateUseCase: ActivateAccountUseCase,
    private readonly forgotUseCase: RequestPasswordResetUseCase,
    private readonly verifyUseCase: VerifyResetCodeUseCase,
    private readonly resetUseCase: ResetPasswordUseCase,
  ) {}

  @Post('login')
  @Endpoint('auth.login', 'login')
  @Can('public')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<LoginResponse | AfterCommit<never>> {
    const result = await this.loginUseCase.execute(parseInput(LoginRequest, body));
    if (result instanceof AfterCommit) return result;
    return { status: 'authenticated', ...opened(res, result) };
  }

  @Post('refresh')
  @Endpoint('auth.refresh', 'refresh')
  @Can('public')
  @HttpCode(200)
  async refresh(
    @Req() req: { headers: { cookie?: string } },
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AccessToken | AfterCommit<never>> {
    const result = await this.refreshUseCase.execute(readRefreshCookie(req.headers.cookie));
    return result instanceof AfterCommit ? result : opened(res, result);
  }

  /** Code consommé, compte actif et connecté directement (cookie de session : pas de « rester connecté » ici). */
  @Post('activate')
  @Endpoint('auth.activate', 'activate')
  @Can('public')
  @HttpCode(200)
  async activate(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AccessToken | AfterCommit<never>> {
    const result = await this.activateUseCase.execute(parseInput(ActivateRequest, body));
    return result instanceof AfterCommit ? result : opened(res, result);
  }

  /** Réponse identique (202, sans corps) que le compte existe ou non. */
  @Post('password/forgot')
  @Endpoint('auth.forgot', 'forgot')
  @Can('public')
  @HttpCode(202)
  forgot(@Body() body: unknown): Promise<AfterCommit<void>> {
    return this.forgotUseCase.execute(parseInput(ForgotPasswordRequest, body));
  }

  @Post('password/verify-code')
  @Endpoint('auth.verify', 'verify')
  @Can('public')
  @HttpCode(200)
  async verifyCode(@Body() body: unknown): Promise<z.infer<typeof ResetToken> | AfterCommit<never>> {
    const result = await this.verifyUseCase.execute(parseInput(VerifyResetCodeRequest, body));
    return result instanceof AfterCommit
      ? result
      : { resetToken: result.resetToken, expiresAt: result.expiresAt.toISOString() };
  }

  /** Toutes les sessions de la personne sont révoquées. */
  @Post('password/reset')
  @Endpoint('auth.reset', 'reset')
  @Can('public')
  @HttpCode(204)
  reset(@Body() body: unknown): Promise<AfterCommit<void>> {
    return this.resetUseCase.execute(parseInput(ResetPasswordRequest, body));
  }

  @Post('logout')
  @Endpoint('auth.logout', 'logout')
  @Can('authenticated')
  @HttpCode(204)
  async logout(@Req() req: object, @Res({ passthrough: true }) res: CookieResponse): Promise<AfterCommit<void>> {
    const session = authenticatedSession(req);
    clearRefreshCookie(res);
    return this.logoutUseCase.execute({ userId: session.sub, sessionId: session.sid });
  }
}
