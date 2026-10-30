// Surface du module members pour les autres modules et les scripts (architecture/01). Souscripteurs et inscriptions :
// lot 2.3.
export { MembersCliModule } from './members-cli.module.js';
export { REFERENCE_MEMBER_ASSOCIATIONS, SeedDevMembersUseCase } from './application/seed-dev-members.use-case.js';
// Registre (lot 2.4) : inscriptions chargées avec leurs échéances (grille), cases calculées par le domaine.
export { MembersModule } from './members.module.js';
export {
  type EnrollmentEntry,
  listPosition,
  MemberDirectory,
  pageOf,
  standingFacets,
} from './application/member-directory.js';
export { installmentView } from './application/enrollment-views.js';
export { associationToday, contextAssociationId } from './application/member-context.js';
