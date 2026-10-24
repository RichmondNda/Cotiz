import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { AssociationParams, ENDPOINTS } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { ListPaymentMethodsUseCase } from '../application/list-payment-methods.use-case.js';
import { ReplacePaymentMethodsUseCase } from '../application/replace-payment-methods.use-case.js';

const ReplaceBody = ENDPOINTS['as.pm'].operations.replace.request.body;

/** as.pm : moyens de paiement de l'association (owner ; association lue dans l'URL, MembershipGuard). */
@Controller('associations/:aid/payment-methods')
export class AssociationPaymentMethodsController {
  constructor(
    private readonly listMethods: ListPaymentMethodsUseCase,
    private readonly replaceMethods: ReplacePaymentMethodsUseCase,
  ) {}

  @Get()
  @Endpoint('as.pm', 'list')
  @Can('association.settings.manage')
  list(@Param() params: unknown) {
    return this.listMethods.execute(parseInput(AssociationParams, params).aid);
  }

  @Put()
  @Endpoint('as.pm', 'replace')
  @Can('association.settings.manage')
  replace(@Param() params: unknown, @Body() body: unknown) {
    return this.replaceMethods.execute(parseInput(AssociationParams, params).aid, parseInput(ReplaceBody, body).items);
  }
}
