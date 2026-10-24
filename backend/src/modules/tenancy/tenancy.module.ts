import { Module } from '@nestjs/common';
import { CompleteOnboardingUseCase } from './application/complete-onboarding.use-case.js';
import { ListPaymentMethodsUseCase } from './application/list-payment-methods.use-case.js';
import { ReplacePaymentMethodsUseCase } from './application/replace-payment-methods.use-case.js';
import { GetAssociationProfileUseCase } from './application/get-association-profile.use-case.js';
import { GetAssociationUseCase } from './application/get-association.use-case.js';
import { ListAssociationsUseCase } from './application/list-associations.use-case.js';
import { ReactivateAssociationUseCase } from './application/reactivate-association.use-case.js';
import { SuspendAssociationUseCase } from './application/suspend-association.use-case.js';
import { UpdateAssociationProfileUseCase } from './application/update-association-profile.use-case.js';
import { UpdateAssociationUseCase } from './application/update-association.use-case.js';
import { AssociationOnboardingController } from './http/association-onboarding.controller.js';
import { AssociationPaymentMethodsController } from './http/association-payment-methods.controller.js';
import { AssociationProfileController } from './http/association-profile.controller.js';
import { PlatformAssociationAdminController } from './http/platform-association-admin.controller.js';

/**
 * Module tenancy : lecture plateforme des associations (pf.asso.list, pf.asso.get), modification (pf.asso.patch),
 * suspension (pf.asso.suspend) ; profil et moyens de paiement par ses gestionnaires (as.get, as.patch, as.pm), clôture de l'onboarding (as.onb), lot 2.1.
 */
@Module({
  controllers: [
    PlatformAssociationAdminController,
    AssociationProfileController,
    AssociationPaymentMethodsController,
    AssociationOnboardingController,
  ],
  providers: [
    ListAssociationsUseCase,
    GetAssociationUseCase,
    UpdateAssociationUseCase,
    SuspendAssociationUseCase,
    ReactivateAssociationUseCase,
    GetAssociationProfileUseCase,
    UpdateAssociationProfileUseCase,
    ListPaymentMethodsUseCase,
    ReplacePaymentMethodsUseCase,
    CompleteOnboardingUseCase,
  ],
})
export class TenancyModule {}
