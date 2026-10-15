import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { type AccessToken, LoginRequest, type LoginResponse } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { AfterCommit } from '../../../shared/tenant-context/index.js';
import { LoginUseCase, type OpenedSession } from '../application/login.use-case.js';
import { LogoutUseCase } from '../application/logout.use-case.js';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case.js';
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
