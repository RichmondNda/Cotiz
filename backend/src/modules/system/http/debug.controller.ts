import { Controller, Get, Module } from '@nestjs/common';
import { WithoutTenantContext } from '../../../shared/tenant-context/index.js';

/**
 * Démonstration de l'observabilité (lot 0.6) : `GET /api/v1/__debug/error` lève une erreur, journalisée avec son
 * requestId et son traceId, et signalée à GlitchTip si un DSN est configuré. Hors contrat, montée en développement
 * seulement (AppModule).
 */
@Controller('__debug')
@WithoutTenantContext()
export class DebugController {
  @Get('error')
  error(): never {
    throw new Error('erreur provoquée pour la démonstration (GET /api/v1/__debug/error)');
  }
}

@Module({ controllers: [DebugController] })
export class DebugModule {}
