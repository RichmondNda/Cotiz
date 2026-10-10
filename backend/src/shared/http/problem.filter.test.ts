import {
  BadRequestException,
  type ArgumentsHost,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { Problem } from '@cotiz/contracts';
import { VersionConflictError } from '@cotiz/db';
import { DrizzleQueryError } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithRequestInfo } from '../request-info/index.js';
import { DomainProblem } from './domain-problem.js';
import { ProblemFilter } from './problem.filter.js';
import { FakeResponse } from './testing.js';

function render(error: unknown): FakeResponse {
  const response = new FakeResponse();
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  runWithRequestInfo({ requestId: 'req-1', ip: null, userAgent: null }, () => {
    new ProblemFilter().catch(error, host);
  });
  return response;
}

/** Erreur PostgreSQL telle que Drizzle l'enveloppe (`cause`). */
function pgError(code: string, message: string): Error {
  return new Error('Failed query: …', { cause: Object.assign(new Error(message), { code }) });
}

describe('ProblemFilter : toute erreur → application/problem+json avec un code du catalogue', () => {
  it('DomainProblem : statut et message du catalogue, détails et requestId', () => {
    const res = render(new DomainProblem('validation_failed', { fields: { fileName: 'too_small' } }));
    expect(res.statusCode).toBe(422);
    expect(res.contentType).toBe('application/problem+json');
    expect(Problem.parse(res.body)).toEqual({
      type: 'https://docs.cotiz.app/errors/validation_failed',
      title: 'Certains champs sont invalides.',
      status: 422,
      code: 'validation_failed',
      fields: { fileName: 'too_small' },
      requestId: 'req-1',
    });
  });

  it('verrou optimiste périmé → 412 version_conflict, sans détail', () => {
    const res = render(new VersionConflictError('projects'));
    expect(res.statusCode).toBe(412);
    expect(res.body).toEqual({
      type: 'https://docs.cotiz.app/errors/version_conflict',
      title: 'Ces informations ont été modifiées entre-temps. Rechargez la page.',
      status: 412,
      code: 'version_conflict',
      requestId: 'req-1',
    });
    expect(JSON.stringify(res.body)).not.toContain('projects');
  });

  it.each([
    ['refus RLS', '42501', 'new row violates row-level security policy for table "files"'],
    ['droit absent', '42501', 'permission denied for table audit_logs'],
  ])('%s (42501) → 404 not_found, jamais un 403 détaillé', (_case, code, message) => {
    const res = render(pgError(code, message));
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'not_found' });
    expect(JSON.stringify(res.body)).not.toContain('files');
    expect(JSON.stringify(res.body)).not.toContain('audit_logs');
  });

  it.each([
    ['NotFound', new NotFoundException(), 404, 'not_found'],
    ['Unauthorized', new UnauthorizedException(), 401, 'session_expired'],
    ['BadRequest (JSON illisible)', new BadRequestException('Unexpected token } in JSON'), 422, 'validation_failed'],
    ['PayloadTooLarge', new PayloadTooLargeException(), 422, 'validation_failed'],
  ])('exception Nest %s → %i %s, sans son message', (_name, error, status, code) => {
    const res = render(error);
    expect(res.statusCode).toBe(status);
    expect(Problem.parse(res.body).code).toBe(code);
    expect(JSON.stringify(res.body)).not.toContain('Unexpected token');
  });

  it('erreur inattendue → 500 internal_error, sans message ni pile', () => {
    const res = render(pgError('23505', 'duplicate key value violates unique constraint "users_phone_e164_key"'));
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      type: 'https://docs.cotiz.app/errors/internal_error',
      title: 'Une erreur est survenue. Réessayez dans quelques instants.',
      status: 500,
      code: 'internal_error',
      requestId: 'req-1',
    });
  });

  it('valeur non-Error levée → 500 internal_error', () => {
    expect(render('boum').statusCode).toBe(500);
  });

  describe('journal (règle 10 : ni secret, ni code, ni téléphone)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const logged = (level: 'error' | 'warn') => {
      const spy = vi.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
      return () => spy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
    };

    it('erreur SQL : SQLSTATE et contrainte, jamais la requête, ses paramètres ni le message PostgreSQL', () => {
      const journal = logged('error');
      const pg = Object.assign(new Error('duplicate key value violates unique constraint "users_phone_e164_key"'), {
        code: '23505',
        constraint: 'users_phone_e164_key',
        table: 'users',
        detail: 'Key (phone_e164)=(+2250700000011) already exists.',
      });
      render(new DrizzleQueryError('insert into "users" ("phone_e164") values ($1)', ['+2250700000011'], pg));
      const text = journal();
      expect(text).toContain('23505');
      expect(text).toContain('users_phone_e164_key');
      expect(text).toContain('req-1');
      expect(text).not.toContain('2250700000011');
      expect(text).not.toContain('Failed query');
      expect(text).not.toContain('insert into');
    });

    it('autre erreur inattendue : pile journalisée', () => {
      const journal = logged('error');
      render(new Error('invariant cassé'));
      expect(journal()).toContain('invariant cassé');
    });

    it('refus 42501 → 404 pour le client, avertissement pour l’exploitation (sans valeur)', () => {
      const journal = logged('warn');
      const res = render(pgError('42501', 'new row violates row-level security policy for table "files"'));
      expect(res.statusCode).toBe(404);
      expect(journal()).toContain('42501');
      expect(journal()).toContain('req-1');
    });
  });
});
