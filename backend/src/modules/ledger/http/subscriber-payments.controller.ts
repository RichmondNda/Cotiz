import { Body, Controller, Get, Header, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { AllocationPreviewInput, DeclarePaymentInput, ENDPOINTS } from '@cotiz/contracts';
import { Can, DomainProblem, Endpoint, parseInput } from '../../../shared/http/index.js';
import { DeclarePaymentUseCase } from '../application/declare-payment.use-case.js';
import { GetSubscriberPaymentUseCase } from '../application/get-subscriber-payment.use-case.js';
import { PreviewAllocationUseCase } from '../application/preview-allocation.use-case.js';

/**
 * Paiements du souscripteur connecté (lot 3.3, espace subscriber) : aperçu de répartition (me.alloc), déclaration
 * (me.declare), suivi d'une déclaration (me.payment). Toujours la personne du jeton ; propre à la personne : jamais en cache HTTP partagé.
 */
@Controller('me/payments')
export class SubscriberPaymentsController {
  constructor(
    private readonly previewAllocation: PreviewAllocationUseCase,
    private readonly declarePayment: DeclarePaymentUseCase,
    private readonly getPayment: GetSubscriberPaymentUseCase,
  ) {}

  @Post('allocation-preview')
  @HttpCode(200)
  @Endpoint('me.alloc', 'preview')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  preview(@Body() body: unknown) {
    return this.previewAllocation.execute(parseInput(AllocationPreviewInput, body));
  }

  /** Idempotency-Key exigée et contrôlée par l'intercepteur (drapeau du contrat) ; conservée sur le paiement. */
  @Post()
  @HttpCode(201)
  @Endpoint('me.declare', 'declare')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  declare(@Body() body: unknown, @Headers('idempotency-key') idempotencyKey: string) {
    return this.declarePayment.execute(declarationOf(body), idempotencyKey);
  }

  @Get(':id')
  @Endpoint('me.payment', 'get')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  get(@Param() params: unknown) {
    return this.getPayment.execute(parseInput(ENDPOINTS['me.payment'].operations.get.request.params, params).id);
  }
}

/** Corps de me.declare ; seule la règle « preuve ou référence » du contrat en défaut → `proof_required` (errors.yaml). */
function declarationOf(body: unknown) {
  const parsed = DeclarePaymentInput.safeParse(body);
  if (!parsed.success && parsed.error.issues.every((i) => i.message === 'proof_required')) {
    throw new DomainProblem('proof_required');
  }
  return parseInput(DeclarePaymentInput, body);
}
