import { Module } from '@nestjs/common';
import { GetAssociationUseCase } from './application/get-association.use-case.js';
import { ListAssociationsUseCase } from './application/list-associations.use-case.js';
import { ReactivateAssociationUseCase } from './application/reactivate-association.use-case.js';
import { SuspendAssociationUseCase } from './application/suspend-association.use-case.js';
import { UpdateAssociationUseCase } from './application/update-association.use-case.js';
import { PlatformAssociationAdminController } from './http/platform-association-admin.controller.js';

/** Module tenancy (lot 1.4) : lecture plateforme des associations (pf.asso.list, pf.asso.get), modification (pf.asso.patch), suspension (pf.asso.suspend). */
@Module({
  controllers: [PlatformAssociationAdminController],
  providers: [
    ListAssociationsUseCase,
    GetAssociationUseCase,
    UpdateAssociationUseCase,
    SuspendAssociationUseCase,
    ReactivateAssociationUseCase,
  ],
})
export class TenancyModule {}
