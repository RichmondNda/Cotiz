import { Module } from '@nestjs/common';
import { GetAssociationProfileUseCase } from './application/get-association-profile.use-case.js';
import { GetAssociationUseCase } from './application/get-association.use-case.js';
import { ListAssociationsUseCase } from './application/list-associations.use-case.js';
import { ReactivateAssociationUseCase } from './application/reactivate-association.use-case.js';
import { SuspendAssociationUseCase } from './application/suspend-association.use-case.js';
import { UpdateAssociationProfileUseCase } from './application/update-association-profile.use-case.js';
import { UpdateAssociationUseCase } from './application/update-association.use-case.js';
import { AssociationProfileController } from './http/association-profile.controller.js';
import { PlatformAssociationAdminController } from './http/platform-association-admin.controller.js';

/**
 * Module tenancy : lecture plateforme des associations (pf.asso.list, pf.asso.get), modification (pf.asso.patch),
 * suspension (pf.asso.suspend) ; profil par ses gestionnaires (as.get, as.patch, lot 2.1).
 */
@Module({
  controllers: [PlatformAssociationAdminController, AssociationProfileController],
  providers: [
    ListAssociationsUseCase,
    GetAssociationUseCase,
    UpdateAssociationUseCase,
    SuspendAssociationUseCase,
    ReactivateAssociationUseCase,
    GetAssociationProfileUseCase,
    UpdateAssociationProfileUseCase,
  ],
})
export class TenancyModule {}
