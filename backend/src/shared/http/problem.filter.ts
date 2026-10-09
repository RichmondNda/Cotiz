import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { ERRORS, type Problem } from '@cotiz/contracts';
import { currentRequestInfo } from '../request-info/index.js';
import { DomainProblem } from './domain-problem.js';

interface HttpResponse {
  status(code: number): HttpResponse;
  type(contentType: string): HttpResponse;
  json(body: unknown): void;
}

/**
 * DomainProblem → `application/problem+json` (RFC 9457, architecture/06). L'étape 5 du lot 0.5 complète :
 * erreurs Nest, 412 version_conflict, refus RLS, erreurs inattendues.
 */
@Catch(DomainProblem)
export class ProblemFilter implements ExceptionFilter<DomainProblem> {
  catch(problem: DomainProblem, host: ArgumentsHost): void {
    const { http, message } = ERRORS[problem.code];
    const requestId = currentRequestInfo()?.requestId;
    const body: Problem = {
      type: `https://docs.cotiz.app/errors/${problem.code}`,
      title: message,
      status: http,
      code: problem.code,
      ...problem.details,
      ...(requestId ? { requestId } : {}),
    };
    host.switchToHttp().getResponse<HttpResponse>().status(http).type('application/problem+json').json(body);
  }
}
