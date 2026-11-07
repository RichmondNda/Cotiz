// Surface du module projects pour les autres modules et les scripts (architecture/01). Projets : lot 2.2 ; conditions
// figées par la validation d'un paiement, libérées par son annulation : lot 2.4.
export { platformProjectCountsOf, type ProjectCounts } from './application/platform-project-counts.js';
export { paymentMethodsInUse } from './application/payment-methods-in-use.js';
export { REFERENCE_PROJECT_ASSOCIATIONS, SeedDevProjectsUseCase } from './application/seed-dev-projects.use-case.js';
export {
  associationProjectsOf,
  enrollmentScheduleOf,
  lockAssociationProjects,
  lockFinancialTerms,
  platformProjectsOf,
  projectOf,
  projectScheduleLines,
  projectsOf,
  type ProjectRecord,
  rollingExtensionOf,
  subscriberProjectLinksOf,
  termsOf,
  toSummaries,
  unlockFinancialTerms,
} from './application/project-records.js';
