import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.public.js';
import { ContractViews } from './application/contract-views.js';
import { GetContractUseCase } from './application/get-contract.use-case.js';
import { ListContractsUseCase } from './application/list-contracts.use-case.js';
import { LockContractUseCase } from './application/lock-contract.use-case.js';
import { UpdateContractUseCase } from './application/update-contract.use-case.js';
import { ContractsController } from './http/contracts.controller.js';

/** Module contracts (endpoints.yaml : ct.get, ct.list ; lot 4.1) : éditeur de contrat d'un projet. */
@Module({
  imports: [IdentityModule],
  controllers: [ContractsController],
  providers: [ContractViews, GetContractUseCase, UpdateContractUseCase, LockContractUseCase, ListContractsUseCase],
})
export class ContractsModule {}
