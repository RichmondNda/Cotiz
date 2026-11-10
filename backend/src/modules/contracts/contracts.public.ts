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
// Worker documents : contenu du PDF d'une signature (texte revérifié contre l'empreinte signée).
export { signedContractDocumentOf } from './application/signed-contract-documents.js';
// Espace souscripteur (reporting : me.dash, me.project) : contrat verrouillé à signer, date de signature.
export { type SubscriberContractState, subscriberContractStatesOf } from './application/subscriber-contract-states.js';
// CLI seed-dev : contrats de référence (seed-reference.yaml).
export { REFERENCE_CONTRACT_ASSOCIATIONS, SeedDevContractsUseCase } from './application/seed-dev-contracts.use-case.js';
// Vues gestionnaire des inscriptions (members) : date de signature du contrat.
export { contractSignedAtOf } from './application/contract-records.js';
