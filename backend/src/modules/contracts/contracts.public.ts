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
// Vues gestionnaire des inscriptions (members) : date de signature du contrat.
export { contractSignedAtOf } from './application/contract-records.js';
