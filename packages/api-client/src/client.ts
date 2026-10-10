import { ENDPOINTS, Problem } from '@cotiz/contracts';
import type { EndpointDef, ErrorCode, OperationDef } from '@cotiz/contracts';
import type { z } from 'zod';

// Client typé généré du registre de @cotiz/contracts : `client.call('<id>', '<opération>', { params, query, body })`.
// Idempotency-Key et If-Match sont ajoutés selon les drapeaux de l'endpoint ; les erreurs `Problem` sont typées.

type Endpoints = typeof ENDPOINTS;
export type EndpointKey = keyof Endpoints;
export type OperationName<I extends EndpointKey> = keyof Endpoints[I]['operations'] & string;
type Op<I extends EndpointKey, N extends OperationName<I>> = Endpoints[I]['operations'][N];
type Flags<I extends EndpointKey> = Endpoints[I]['flags'];
type Request<I extends EndpointKey, N extends OperationName<I>> = Op<I, N> extends { request: infer R } ? R : never;
type Writes<I extends EndpointKey, N extends OperationName<I>> = Op<I, N> extends { method: 'GET' } ? false : true;

type Part<R, K extends string, Name extends string = K> =
  R extends Record<K, infer S extends z.ZodType> ? Record<Name, z.input<S>> : Partial<Record<Name, never>>;
type QueryPart<R> = R extends { query: infer S extends z.ZodType } ? { query?: z.input<S> } : { query?: never };

type IdempotencyPart<I extends EndpointKey, N extends OperationName<I>> =
  Writes<I, N> extends true
    ? Flags<I>['idempotencyKey'] extends true
      ? { /** Réutiliser la même clé pour rejouer la même opération. */ idempotencyKey?: string }
      : unknown
    : unknown;
type IfMatchPart<I extends EndpointKey, N extends OperationName<I>> =
  Writes<I, N> extends true
    ? Flags<I>['ifMatch'] extends true
      ? { /** `version` de la ressource lue. */ ifMatch: number }
      : unknown
    : unknown;

export type CallInput<I extends EndpointKey, N extends OperationName<I>> = Part<Request<I, N>, 'params'> &
  QueryPart<Request<I, N>> &
  Part<Request<I, N>, 'body'> &
  IdempotencyPart<I, N> &
  IfMatchPart<I, N> & { signal?: AbortSignal };

type Response_<I extends EndpointKey, N extends OperationName<I>> = Op<I, N> extends { response: infer R } ? R : never;
export type CallOutput<I extends EndpointKey, N extends OperationName<I>> =
  Response_<I, N> extends { contentType: 'text/event-stream' }
    ? Response
    : Response_<I, N> extends { status: 302 }
      ? Response
      : Response_<I, N> extends { body: infer B extends z.ZodType }
        ? z.output<B>
        : undefined;

/** Entrée facultative quand l'opération n'a ni paramètre, ni corps, ni en-tête obligatoire. */
type Args<I extends EndpointKey, N extends OperationName<I>> =
  Record<string, never> extends CallInput<I, N> ? [input?: CallInput<I, N>] : [input: CallInput<I, N>];

/** Erreur HTTP ; `problem` est renseigné quand la réponse est un `Problem` du catalogue. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    readonly status: number,
    readonly problem: Problem | null,
    /** En-tête `X-Request-Id` de la réponse (toute erreur, même sans corps Problem). */
    private readonly headerRequestId: string | null = null,
  ) {
    super(problem ? `${problem.code} : ${problem.title}` : `HTTP ${String(status)}`);
  }
  get code(): ErrorCode | null {
    return this.problem?.code ?? null;
  }
  /** Identifiant de la requête (architecture/06) : à citer au support, joint aux rapports d'erreur du front. */
  get requestId(): string | null {
    return this.problem?.requestId ?? this.headerRequestId;
  }
}

export interface ClientOptions {
  /** Origine de l'api ou du proxy Nuxt (même origine en front : `''`). */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  /** En-têtes ajoutés à chaque appel (jeton d'accès…). */
  headers?: () => HeadersInit | Promise<HeadersInit>;
  credentials?: RequestCredentials;
  newIdempotencyKey?: () => string;
}

interface RawInput {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: number;
  signal?: AbortSignal;
}

function definition(id: EndpointKey, name: string): { def: EndpointDef; op: OperationDef } {
  const def = ENDPOINTS[id] as EndpointDef;
  const op = def.operations[name];
  if (!op) throw new Error(`Opération inconnue : ${id}.${name}`);
  return { def, op };
}

function buildPath(op: OperationDef, params: Record<string, unknown> | undefined): string {
  const parsed = op.request.params ? op.request.params.parse(params ?? {}) : {};
  return op.path.replace(/\{(\w+)\}/g, (_m, key: string) => encodeURIComponent(String(parsed[key])));
}

function buildQuery(op: OperationDef, query: Record<string, unknown> | undefined): string {
  if (!op.request.query) return '';
  const parsed = op.request.query.parse(query ?? {});
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? (value as unknown[]) : [value]) search.append(key, String(item));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

async function toError(response: Response): Promise<ApiError> {
  const type = response.headers.get('content-type') ?? '';
  const requestId = response.headers.get('x-request-id');
  if (type.includes('json')) {
    const parsed = Problem.safeParse(await response.json().catch(() => null));
    if (parsed.success) return new ApiError(response.status, parsed.data, requestId);
  }
  return new ApiError(response.status, null, requestId);
}

export function createClient(options: ClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const newKey = options.newIdempotencyKey ?? (() => crypto.randomUUID());

  function url<I extends EndpointKey, N extends OperationName<I>>(id: I, name: N, ...[input]: Args<I, N>): string {
    const raw = (input ?? {}) as RawInput;
    const { op } = definition(id, name);
    return `${options.baseUrl}${buildPath(op, raw.params)}${buildQuery(op, raw.query)}`;
  }

  async function call<I extends EndpointKey, N extends OperationName<I>>(
    id: I,
    name: N,
    ...[input]: Args<I, N>
  ): Promise<CallOutput<I, N>> {
    const raw = (input ?? {}) as RawInput;
    const { def, op } = definition(id, name);
    const headers = new Headers(await options.headers?.());
    headers.set('accept', 'application/json, application/problem+json');

    let body: string | undefined;
    if (op.request.body) {
      body = JSON.stringify(op.request.body.parse(raw.body));
      headers.set('content-type', 'application/json');
    }
    if (op.method !== 'GET') {
      if (def.flags.idempotencyKey) headers.set('idempotency-key', raw.idempotencyKey ?? newKey());
      if (def.flags.ifMatch) {
        if (raw.ifMatch === undefined) throw new Error(`${id}.${name} : If-Match (version) obligatoire`);
        headers.set('if-match', `W/"${String(raw.ifMatch)}"`);
      }
    }

    const response = await doFetch(url(id, name, ...([input] as Args<I, N>)), {
      method: op.method,
      headers,
      body,
      credentials: options.credentials,
      signal: raw.signal,
    });
    if (!response.ok) throw await toError(response);
    if (op.response.contentType === 'text/event-stream' || op.response.status === 302) {
      return response as CallOutput<I, N>;
    }
    if (response.status === 204 || !op.response.body) return undefined as CallOutput<I, N>;
    return (await response.json()) as CallOutput<I, N>;
  }

  return { call, url };
}

export type ApiClient = ReturnType<typeof createClient>;
