import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { LoginRequest, type LoginResponse } from '@cotiz/contracts';
import { Endpoint, parseInput } from '../../../shared/http/index.js';
import { AfterCommit } from '../../../shared/tenant-context/index.js';
import { LoginUseCase } from '../application/login.use-case.js';
import { type CookieResponse, setRefreshCookie } from './refresh-cookie.js';

/** Authentification (endpoints.yaml, espace auth). */
@Controller('auth')
export class AuthController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  @Post('login')
  @Endpoint('auth.login', 'login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<LoginResponse | AfterCommit<never>> {
    const result = await this.loginUseCase.execute(parseInput(LoginRequest, body));
    if (result instanceof AfterCommit) return result;
    setRefreshCookie(res, result.refreshToken, result.rememberMe);
    return {
      status: 'authenticated',
      accessToken: result.accessToken,
      expiresAt: result.expiresAt.toISOString(),
      space: result.space,
    };
  }
}
