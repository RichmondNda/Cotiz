import { Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ActivationCodeParams, ActivationCodesQuery, AssociationParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { ListActivationCodesUseCase } from '../application/list-activation-codes.use-case.js';
import { MarkActivationCodeHandedUseCase } from '../application/mark-activation-code-handed.use-case.js';

/**
 * « Codes à remettre » d'une association (mb.codes) ; association lue dans l'URL (MembershipGuard). Réponses avec codes
 * en clair : jamais en cache.
 */
@Controller('associations/:aid/activation-codes')
export class ActivationCodesController {
  constructor(
    private readonly listCodes: ListActivationCodesUseCase,
    private readonly markHanded: MarkActivationCodeHandedUseCase,
  ) {}

  @Get()
  @Endpoint('mb.codes', 'list')
  @Can('members.manage')
  @Header('Cache-Control', 'no-store')
  list(@Param() params: unknown, @Query() query: unknown) {
    return this.listCodes.execute(parseInput(AssociationParams, params).aid, parseInput(ActivationCodesQuery, query));
  }

  @Post(':codeId/handed')
  @Endpoint('mb.codes', 'markHanded')
  @Can('members.manage')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  handed(@Param() params: unknown) {
    const { aid, codeId } = parseInput(ActivationCodeParams, params);
    return this.markHanded.execute(aid, codeId);
  }
}
