import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { AllocationPreviewInput } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { PreviewAllocationUseCase } from '../application/preview-allocation.use-case.js';

/**
 * Paiements du souscripteur connecté (lot 3.3, espace subscriber) : aperçu de répartition (me.alloc). Toujours la
 * personne du jeton ; propre à la personne : jamais en cache HTTP partagé.
 */
@Controller('me/payments')
export class SubscriberPaymentsController {
  constructor(private readonly previewAllocation: PreviewAllocationUseCase) {}

  @Post('allocation-preview')
  @HttpCode(200)
  @Endpoint('me.alloc', 'preview')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  preview(@Body() body: unknown) {
    return this.previewAllocation.execute(parseInput(AllocationPreviewInput, body));
  }
}
