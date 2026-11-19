import { projectOf } from '../../projects/projects.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { type RuleInput, ruleIssues } from '../domain/reminder-rule.js';

/** Règle refusée (422 `validation_failed`, details.fields) ou projet d'une autre association (404). */
export async function assertValidRule(associationId: string, rule: RuleInput): Promise<void> {
  const issues = ruleIssues(rule);
  if (Object.keys(issues).length > 0) throw new DomainProblem('validation_failed', { fields: issues });
  if (rule.projectId && !(await projectOf(associationId, rule.projectId))) throw new DomainProblem('not_found');
}
