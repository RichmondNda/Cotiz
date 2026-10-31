import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  AssociationParams,
  GridQuery,
  InstallmentParams,
  PaymentParams,
  PaymentsQuery,
  ProjectParams,
  ValidatePaymentInput,
} from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetInstallmentUseCase } from '../application/get-installment.use-case.js';
import { GetPaymentUseCase } from '../application/get-payment.use-case.js';
import { ListPaymentsUseCase } from '../application/list-payments.use-case.js';
import { ProjectGridUseCase } from '../application/project-grid.use-case.js';
import { ValidatePaymentUseCase } from '../application/validate-payment.use-case.js';

/** Registre d'une association (lg.*) : grille, échéances, paiements et leur validation ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid')
export class LedgerController {
  constructor(
    private readonly projectGrid: ProjectGridUseCase,
    private readonly getInstallment: GetInstallmentUseCase,
    private readonly listPayments: ListPaymentsUseCase,
    private readonly getPayment: GetPaymentUseCase,
    private readonly validatePayment: ValidatePaymentUseCase,
  ) {}

  @Get('projects/:pid/grid')
  @Endpoint('lg.grid', 'get')
  @Can('association.read')
  grid(@Param() params: unknown, @Query() query: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.projectGrid.execute(aid, pid, parseInput(GridQuery, query));
  }

  @Get('installments/:iid')
  @Endpoint('lg.inst', 'get')
  @Can('association.read')
  installment(@Param() params: unknown) {
    const { aid, iid } = parseInput(InstallmentParams, params);
    return this.getInstallment.execute(aid, iid);
  }

  @Get('payments')
  @Endpoint('lg.pay.list', 'list')
  @Can('association.read')
  payments(@Param() params: unknown, @Query() query: unknown) {
    const { aid } = parseInput(AssociationParams, params);
    return this.listPayments.execute(aid, parseInput(PaymentsQuery, query));
  }

  @Get('payments/:payId')
  @Endpoint('lg.pay.get', 'get')
  @Can('association.read')
  payment(@Param() params: unknown) {
    const { aid, payId } = parseInput(PaymentParams, params);
    return this.getPayment.execute(aid, payId);
  }

  @Post('payments/:payId/validate')
  @HttpCode(200)
  @Endpoint('lg.pay.validate', 'validate')
  @Can('payments.review')
  validate(@Param() params: unknown, @Body() body: unknown) {
    const { aid, payId } = parseInput(PaymentParams, params);
    return this.validatePayment.execute(aid, payId, parseInput(ValidatePaymentInput, body));
  }
}
