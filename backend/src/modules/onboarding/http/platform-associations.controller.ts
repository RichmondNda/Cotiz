import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { type AssociationCreated, CreateAssociationInput, IdParams } from '@cotiz/contracts';
import { Can, Endpoint, idempotentReplay, parseInput, ReplayInHandler } from '../../../shared/http/index.js';
import { CreateAssociationUseCase } from '../application/create-association.use-case.js';

/** Ce que le rejeu retrouve de l'opération mémorisée. */
const Reference = IdParams.extend({ ownerUserId: IdParams.shape.id });

/** pf.asso.create : création directe d'une association (owner et admin plateforme). */
@Controller('platform/associations')
export class PlatformAssociationsController {
  constructor(private readonly createAssociation: CreateAssociationUseCase) {}

  // Réponse avec le code d'activation : seuls les identifiants de l'association et de son owner d'origine sont mémorisés,
  // le rejeu reconstruit le reste.
  @Post()
  @HttpCode(201)
  @Endpoint('pf.asso.create', 'create')
  @Can('platform.associations.manage')
  @ReplayInHandler((body) => {
    const { association } = body as AssociationCreated;
    return { id: association.id, ownerUserId: association.owner.id };
  })
  create(@Body() body: unknown, @Req() request: object) {
    const input = parseInput(CreateAssociationInput, body);
    const replay = idempotentReplay(request);
    return replay
      ? this.createAssociation.replay(Reference.parse(replay.reference), input)
      : this.createAssociation.execute(input);
  }
}
