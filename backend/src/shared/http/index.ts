// Conventions HTTP (architecture/06) : erreurs problem+json, validation par les schémas du contrat, acteur.
export { type Actor, requireActor } from './actor.js';
export { DomainProblem, type ProblemDetails } from './domain-problem.js';
export { ProblemFilter } from './problem.filter.js';
export { parseInput } from './validation.js';
