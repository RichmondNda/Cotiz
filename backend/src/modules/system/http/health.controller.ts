import { Controller, Get, Res } from '@nestjs/common';
import type { HealthLiveResponse, HealthReadyResponse } from '@cotiz/contracts';
import { Can, Endpoint } from '../../../shared/http/index.js';
import { WithoutTenantContext } from '../../../shared/tenant-context/index.js';
import { ReadinessProbe } from '../infra/readiness-probe.js';

// sys.health — permission `public`. Aucune donnée lue : pas de transaction de contexte.
@Controller('health')
@WithoutTenantContext()
export class HealthController {
  constructor(private readonly probe: ReadinessProbe) {}

  @Get('live')
  @Endpoint('sys.health', 'live')
  @Can('public')
  live(): HealthLiveResponse {
    return { status: 'ok' };
  }

  /** 200 si tout répond ; 503 avec le même corps sinon (pas une erreur `Problem` : l'état de chaque dépendance). */
  @Get('ready')
  @Endpoint('sys.health', 'ready')
  @Can('public')
  async ready(@Res({ passthrough: true }) res: { status(code: number): unknown }): Promise<HealthReadyResponse> {
    const result = await this.probe.check();
    if (result.status !== 'ok') res.status(503);
    return result;
  }
}
