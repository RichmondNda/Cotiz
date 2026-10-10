import { createHash } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { catchError, from, mergeMap, type Observable, of, throwError } from 'rxjs';
import { RedisClient } from '../redis/redis.module.js';
import { currentRequestInfo } from '../request-info/index.js';
import { getRequestContext } from '../tenant-context/index.js';
import { DomainProblem } from './domain-problem.js';
import { endpointOf } from './endpoint.js';

/** Réponse mémorisée (24 h) ou requête en cours (verrou court) pour une clé. */
export type IdempotencyRecord =
  { state: 'pending'; fingerprint: string } | { state: 'done'; fingerprint: string; status: number; body: unknown };

export interface IdempotencyStore {
  /** Pose le verrou « en cours » s'il n'y a rien ; sinon renvoie ce qui existe. */
  begin(key: string, fingerprint: string, ttlSeconds: number): Promise<IdempotencyRecord | null>;
  complete(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<void>;
  abandon(key: string): Promise<void>;
}

export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');

/** Réponse conservée 24 h (architecture/06) ; verrou d'une requête en cours, au-delà duquel elle peut être renvoyée. */
const RESPONSE_TTL_SECONDS = 24 * 3600;
const PENDING_TTL_SECONDS = 60;
/** Clé fournie par le client (UUID du client typé) : 8 à 128 caractères sûrs. */
const KEY = /^[A-Za-z0-9_-]{8,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** JSON canonique (clés triées) : deux corps identiques à l'ordre près ont la même empreinte. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

/** Empreinte d'une requête : méthode, chemin (avec la requête) et corps canonique. */
export function requestFingerprint(method: string, url: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method} ${url}\n${canonical(body)}`)
    .digest('hex');
}

/** Stockage Redis : verrou `SET NX EX`, réponse en JSON. */
@Injectable()
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private readonly client: RedisClient) {}

  async begin(key: string, fingerprint: string, ttlSeconds: number): Promise<IdempotencyRecord | null> {
    const redisKey = `cotiz:idem:${key}`;
    const pending: IdempotencyRecord = { state: 'pending', fingerprint };
    const set = await this.client.redis.set(redisKey, JSON.stringify(pending), 'EX', ttlSeconds, 'NX');
    if (set === 'OK') return null;
    const existing = await this.client.redis.get(redisKey);
    // Expiré entre les deux commandes : la requête est traitée comme nouvelle au prochain essai.
    if (existing === null) throw new DomainProblem('invalid_state');
    return JSON.parse(existing) as IdempotencyRecord;
  }

  async complete(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<void> {
    await this.client.redis.set(`cotiz:idem:${key}`, JSON.stringify(record), 'EX', ttlSeconds);
  }

  async abandon(key: string): Promise<void> {
    await this.client.redis.del(`cotiz:idem:${key}`);
  }
}

/**
 * `Idempotency-Key` (architecture/06), pour les endpoints du contrat qui portent le drapeau : clé exigée ; réponse
 * réussie mémorisée 24 h et rejouée telle quelle (en-tête `Idempotent-Replayed`) ; même clé avec une autre requête →
 * 422 idempotency_key_reused ; même requête encore en cours → 409 invalid_state. Une opération en échec n'est pas
 * mémorisée : la même clé peut être renvoyée. Clés propres à chaque utilisateur : jamais la réponse d'un autre.
 * Placé avant la transaction de contexte : la réponse n'est mémorisée qu'après le COMMIT.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const endpoint = endpointOf(this.reflector, context);
    if (!endpoint?.def.flags.idempotencyKey) return next.handle();

    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      body?: unknown;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const raw = request.headers['idempotency-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (key === undefined || key === '') {
      throw new DomainProblem('validation_failed', { fields: { 'Idempotency-Key': 'required' } });
    }
    if (!KEY.test(key)) throw new DomainProblem('validation_failed', { fields: { 'Idempotency-Key': 'invalid' } });

    // Portée de la clé : l'utilisateur ; sans acteur (endpoint public seulement), l'IP et une clé UUID (non devinable).
    const tenant = getRequestContext(request);
    if (!tenant?.userId && endpoint.def.permission !== 'public') {
      throw new Error(`Idempotency-Key : ${endpoint.id} sans utilisateur identifié (garde manquante ?)`);
    }
    if (!tenant?.userId && !UUID.test(key)) {
      throw new DomainProblem('validation_failed', { fields: { 'Idempotency-Key': 'invalid' } });
    }
    const scope = tenant?.userId ?? `ip:${currentRequestInfo()?.ip ?? 'inconnue'}`;
    const storeKey = `${scope}:${endpoint.id}:${key}`;
    const fingerprint = requestFingerprint(request.method, request.url, request.body);

    const existing = await this.store.begin(storeKey, fingerprint, PENDING_TTL_SECONDS);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new DomainProblem('idempotency_key_reused');
      if (existing.state === 'pending') {
        throw new DomainProblem('invalid_state', { detail: 'Cette opération est déjà en cours.' });
      }
      context
        .switchToHttp()
        .getResponse<{ setHeader(n: string, v: string): void }>()
        .setHeader('Idempotent-Replayed', 'true');
      return of(existing.body);
    }

    const status =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, context.getHandler()) ??
      (request.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);
    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        try {
          await this.store.complete(storeKey, { state: 'done', fingerprint, status, body }, RESPONSE_TTL_SECONDS);
        } catch (error) {
          // L'opération a réussi : renvoyer sa réponse. Le verrou expirera ; un renvoi serait alors réexécuté.
          this.logger.warn(`idempotence : réponse non mémorisée (${(error as Error).message})`);
        }
        return body;
      }),
      // Échec de l'opération : verrou retiré, la même clé pourra être renvoyée.
      catchError((error: unknown) =>
        from(this.store.abandon(storeKey).catch(() => undefined)).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }
}
