import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthLiveResponse, HealthReadyResponse } from '@cotiz/contracts';
import { WithoutTenantContext } from '../../../shared/tenant-context/index.js';
import { ReadinessProbe } from '../infra/readiness-probe.js';

// sys.health — permission `public`. Aucune donnée lue : pas de transaction de contexte.
@Controller('health')
@WithoutTenantContext()
export class HealthController {
  constructor(private readonly probe: ReadinessProbe) {}

  @Get('live')
  live(): HealthLiveResponse {
    return { status: 'ok' };
  }

  /** 200 si tout répond ; 503 avec le même corps sinon. */
  @Get('ready')
  async ready(): Promise<HealthReadyResponse> {
    const result = await this.probe.check();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}
