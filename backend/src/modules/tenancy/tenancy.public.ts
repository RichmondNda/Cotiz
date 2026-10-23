// Surface du module tenancy pour les autres modules et les scripts (architecture/01). Associations : lots 1.3, 1.4, 2.1.
export { type AssociationRecord, platformAssociationOf } from './application/association-records.js';
export { createAssociation, type NewAssociation } from './application/create-association.js';
export { SeedDevAssociationsUseCase } from './application/seed-dev-associations.use-case.js';
