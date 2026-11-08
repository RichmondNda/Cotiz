// Surface du module contracts pour les autres modules (architecture/01). Contrats : lot 4.1.
export { ContractsModule } from './contracts.module.js';
// pr.create (contrat saisi à la création), en.create (inscription en attente de signature), notifications.
export {
  assertContractsFeature,
  createProjectContract,
  enrollmentContractOf,
  pendingSignersOf,
  projectRequiresContract,
  requestContractSignature,
} from './application/contract-records.js';
