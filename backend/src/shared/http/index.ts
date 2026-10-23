// Conventions HTTP (architecture/06) : erreurs problem+json, validation par les schémas du contrat, acteur,
// drapeaux du contrat (limitation de débit, Idempotency-Key, If-Match/ETag).
export { type Actor, requireActor } from './actor.js';
export { ContractSpaceGuard } from './contract-space.guard.js';
export { DomainProblem, type ProblemDetails } from './domain-problem.js';
export { Endpoint, endpointMetadata, endpointOf, type EndpointRef } from './endpoint.js';
export { HttpConventionsModule } from './http-conventions.module.js';
export { isIdempotentReplay, ReplayInHandler } from './idempotency.interceptor.js';
export { expectedVersion } from './if-match.interceptor.js';
export { ProblemFilter } from './problem.filter.js';
export { Can, canMetadata, type RouteAccess, routeAccess } from './route-access.js';
export { parseInput } from './validation.js';
