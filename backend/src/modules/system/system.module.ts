import { Module } from '@nestjs/common';
import { HealthController } from './http/health.controller.js';
import { ReadinessProbe } from './infra/readiness-probe.js';

@Module({
  controllers: [HealthController],
  providers: [ReadinessProbe],
})
export class SystemModule {}
