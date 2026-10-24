import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { AssociationParams, PatchAssociationProfile } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetAssociationProfileUseCase } from '../application/get-association-profile.use-case.js';
import { UpdateAssociationProfileUseCase } from '../application/update-association-profile.use-case.js';

/** as.get, as.patch : profil de l'association par ses gestionnaires (association lue dans l'URL, MembershipGuard). */
@Controller('associations/:aid')
export class AssociationProfileController {
  constructor(
    private readonly getProfile: GetAssociationProfileUseCase,
    private readonly updateProfile: UpdateAssociationProfileUseCase,
  ) {}

  @Get()
  @Endpoint('as.get', 'get')
  @Can('association.read')
  get(@Param() params: unknown) {
    return this.getProfile.execute(parseInput(AssociationParams, params).aid);
  }

  @Patch()
  @Endpoint('as.patch', 'patch')
  @Can('association.settings.manage')
  patch(@Param() params: unknown, @Body() body: unknown) {
    return this.updateProfile.execute(
      parseInput(AssociationParams, params).aid,
      parseInput(PatchAssociationProfile, body),
    );
  }
}
