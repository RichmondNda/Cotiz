import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ERRORS, type ErrorCode, type Problem } from '@cotiz/contracts';
import { VersionConflictError } from '@cotiz/db';
import { currentRequestInfo } from '../request-info/index.js';
import { DomainProblem, type ProblemDetails } from './domain-problem.js';

interface HttpResponse {
  status(code: number): HttpResponse;
  type(contentType: string): HttpResponse;
  json(body: unknown): void;
}

/** Statut d'une exception Nest → code du catalogue. Jamais le message de l'exception (il peut citer l'entrée). */
function codeOfHttpStatus(status: number): ErrorCode {
  if (status === 404) return 'not_found';
  if (status === 401) return 'session_expired';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'too_many_requests';
  // Corps illisible, trop lourd, type de contenu refusé : une entrée invalide.
  if (status === 400 || status === 413 || status === 415 || status === 422) return 'validation_failed';
  return 'internal_error';
}

interface PgError extends Error {
  code: string;
  table?: string;
  constraint?: string;
  column?: string;
  routine?: string;
}

/** Erreur PostgreSQL d'origine (Drizzle l'enveloppe dans `cause`), reconnue à son code SQLSTATE. */
function pgError(error: unknown): PgError | undefined {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ('code' in e && typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e as PgError;
  }
  return undefined;
}

/** Cadres de la pile, sans les lignes de message (qui, pour Drizzle, contiennent la requête et ses paramètres). */
const frames = (error: unknown) =>
  error instanceof Error ? (error.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line)) : [];

/**
 * Ligne de journal d'une erreur SQL : SQLSTATE, table, contrainte, colonne, routine et pile. Jamais le message ni le
 * détail PostgreSQL, ni la requête, ni ses paramètres : ils peuvent citer des valeurs (téléphone, code, montant).
 */
function describeSqlError(error: unknown, pg: PgError): string {
  const fields = { table: pg.table, constraint: pg.constraint, column: pg.column, routine: pg.routine };
  const known = Object.entries(fields).filter(([, v]) => v !== undefined);
  return [`SQLSTATE ${pg.code}`, ...known.map(([k, v]) => `${k}=${String(v)}`), ...frames(error)].join(' ');
}

/**
 * Toute erreur d'une requête → `application/problem+json` (RFC 9457, architecture/06) avec un `code` stable de
 * docs/specs/errors.yaml et le `requestId`. Seuls les détails d'un DomainProblem sont publics :
 * - VersionConflictError → 412 version_conflict, sans détail ;
 * - refus PostgreSQL 42501 (RLS ou droit) → 404 not_found : une ressource d'une autre association n'existe pas ;
 * - exception Nest → code selon son statut ; toute autre erreur → 500 internal_error, journalisée sans être exposée.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const { code, details } = this.classify(error);
    const { http, message } = ERRORS[code];
    const requestId = currentRequestInfo()?.requestId ?? '-';
    const pg = pgError(error);
    if (pg?.code === '42501') {
      // Refus RLS ou droit absent : 404 pour le client, signalé à l'exploitation (le message ne cite que la table).
      this.logger.warn(`${requestId} refus PostgreSQL 42501 traduit en 404 : ${pg.message}`);
    } else if (http >= 500) {
      // Côté serveur seulement, avec le requestId pour retrouver la requête.
      const detail = pg
        ? describeSqlError(error, pg)
        : error instanceof Error
          ? (error.stack ?? error.message)
          : 'valeur non-Error levée';
      this.logger.error(`${requestId} ${detail}`);
    }
    const body: Problem = {
      type: `https://docs.cotiz.app/errors/${code}`,
      title: message,
      status: http,
      code,
      ...details,
      ...(requestId === '-' ? {} : { requestId }),
    };
    host.switchToHttp().getResponse<HttpResponse>().status(http).type('application/problem+json').json(body);
  }

  private classify(error: unknown): { code: ErrorCode; details: ProblemDetails } {
    if (error instanceof DomainProblem) return { code: error.code, details: error.details };
    if (error instanceof VersionConflictError) return { code: 'version_conflict', details: {} };
    if (error instanceof HttpException) return { code: codeOfHttpStatus(error.getStatus()), details: {} };
    if (pgError(error)?.code === '42501') return { code: 'not_found', details: {} };
    return { code: 'internal_error', details: {} };
  }
}
