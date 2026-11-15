import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AssociationParams, IdParams, ListQuery, pfInvoicePaid, pfInvoices } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { ListAssociationInvoicesUseCase } from '../application/list-association-invoices.use-case.js';
import { ListPlatformInvoicesUseCase } from '../application/list-platform-invoices.use-case.js';
import { MarkInvoicePaidUseCase } from '../application/mark-invoice-paid.use-case.js';

/** bl.inv : factures d'abonnement de l'association, lues par ses gestionnaires (MembershipGuard). */
@Controller('associations/:aid/invoices')
export class AssociationInvoicesController {
  constructor(private readonly list: ListAssociationInvoicesUseCase) {}

  @Get()
  @Endpoint('bl.inv', 'list')
  @Can('association.read')
  get(@Param() params: unknown, @Query() query: unknown) {
    return this.list.execute(parseInput(AssociationParams, params).aid, parseInput(ListQuery, query));
  }
}

/** pf.invoices, pf.invoice.paid : facturation globale de la plateforme (connexion cotiz_platform). */
@Controller('platform/invoices')
export class PlatformInvoicesController {
  constructor(
    private readonly list: ListPlatformInvoicesUseCase,
    private readonly markPaid: MarkInvoicePaidUseCase,
  ) {}

  @Get()
  @Endpoint('pf.invoices', 'list')
  @Can('platform.associations.read')
  index(@Query() query: unknown) {
    return this.list.execute(parseInput(pfInvoices.operations.list.request.query, query));
  }

  @Post(':id/mark-paid')
  @HttpCode(200)
  @Endpoint('pf.invoice.paid', 'markPaid')
  @Can('platform.billing.manage')
  paid(@Param() params: unknown, @Body() body: unknown) {
    return this.markPaid.execute(
      parseInput(IdParams, params).id,
      parseInput(pfInvoicePaid.operations.markPaid.request.body, body),
    );
  }
}
