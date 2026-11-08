import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.public.js';
import { ContractViews } from './application/contract-views.js';
import { GetContractUseCase } from './application/get-contract.use-case.js';
import { ListContractsUseCase } from './application/list-contracts.use-case.js';
import { ListSubscriberContractsUseCase } from './application/list-subscriber-contracts.use-case.js';
import { LockContractUseCase } from './application/lock-contract.use-case.js';
import { UpdateContractUseCase } from './application/update-contract.use-case.js';
import { GetSubscriberContractUseCase } from './application/get-subscriber-contract.use-case.js';
import { SignContractUseCase } from './application/sign-contract.use-case.js';
import { SubscriberContracts } from './application/subscriber-contracts.js';
import { ContractsController } from './http/contracts.controller.js';
import { MeContractsController } from './http/me-contracts.controller.js';
import { SubscriberContractsController } from './http/subscriber-contracts.controller.js';

/**
 * Module contracts (endpoints.yaml : ct.get, ct.list, me.contract, me.sign ; lot 4.1) : éditeur de contrat d'un projet,
 * signature du souscripteur.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ContractsController, SubscriberContractsController, MeContractsController],
  providers: [
    ContractViews,
    GetContractUseCase,
    UpdateContractUseCase,
    LockContractUseCase,
    ListContractsUseCase,
    SubscriberContracts,
    GetSubscriberContractUseCase,
    SignContractUseCase,
    ListSubscriberContractsUseCase,
  ],
})
export class ContractsModule {}
