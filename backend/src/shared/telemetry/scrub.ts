import { isSensitiveKey, MASKED, maskPhones } from '../logging/index.js';

/** URL sortantes (MinIO…) : gardées sans query string (code d'activation, téléphone, jeton, signature). */
const URL_ATTRIBUTES = new Set(['url.full', 'http.url']);
/**
 * Jamais exportés (les journaux ne les écrivent pas non plus) : IP et port du client, user-agent, query string,
 * paramètres SQL. Noms actuels des instrumentations (http 0.223, pg 0.75) et anciens noms.
 */
const DROPPED_ATTRIBUTES = new Set([
  'client.address',
  'client.port',
  'network.peer.address',
  'network.peer.port',
  'user_agent.original',
  'url.query',
  'http.client_ip',
  'http.user_agent',
  'net.peer.ip',
  'net.peer.port',
  'net.sock.peer.addr',
  'net.sock.peer.port',
  'db.postgresql.values',
]);
/** Chemin réel (identifiants d'association, d'utilisateur…) : remplacé par la route gabarit, sinon retiré. */
const PATH_ATTRIBUTES = ['url.path', 'http.target'];

interface SpanData {
  attributes: Record<string, unknown>;
  events: { name: string; attributes?: Record<string, unknown> }[];
  status: { code: number; message?: string };
}

const withoutQuery = (value: unknown) => (typeof value === 'string' ? value.replace(/[?#].*$/, '') : value);
const framesOnly = (stack: string) =>
  stack
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
    .join('\n');

/**
 * Nettoie un span avant export (mêmes règles que les journaux, architecture/11) : ni IP, ni user-agent, ni query
 * string, ni chemin réel (route gabarit seulement), ni paramètre SQL ; attributs sensibles et téléphones masqués ;
 * piles d'exception réduites à leurs cadres (leur 1re ligne répète le message). Span PostgreSQL : jamais le message
 * d'erreur (« invalid input syntax for type uuid: "…" » cite la valeur).
 */
export function scrubSpanData(span: SpanData): void {
  const attributes = span.attributes;
  const system = attributes['db.system.name'] ?? attributes['db.system'];
  const isDatabase = system === 'postgresql';
  const route = attributes['http.route'];
  for (const key of PATH_ATTRIBUTES) {
    if (!(key in attributes)) continue;
    if (typeof route === 'string') attributes[key] = route;
    else Reflect.deleteProperty(attributes, key);
  }
  for (const key of Object.keys(attributes)) {
    if (DROPPED_ATTRIBUTES.has(key) || key.startsWith('db.query.parameter')) Reflect.deleteProperty(attributes, key);
    else if (URL_ATTRIBUTES.has(key)) attributes[key] = withoutQuery(attributes[key]);
    else if (isSensitiveKey(key.split('.').at(-1) ?? key)) attributes[key] = MASKED;
    else if (typeof attributes[key] === 'string') attributes[key] = maskPhones(attributes[key]);
  }
  const message = (text: string | undefined) => (isDatabase || text === undefined ? undefined : maskPhones(text));
  span.status.message = message(span.status.message);
  if (span.status.message === undefined) delete span.status.message;
  for (const event of span.events) {
    const eventAttributes = event.attributes;
    if (!eventAttributes) continue;
    const value = eventAttributes['exception.message'];
    if (typeof value === 'string') {
      const masked = message(value);
      if (masked === undefined) Reflect.deleteProperty(eventAttributes, 'exception.message');
      else eventAttributes['exception.message'] = masked;
    }
    const stack = eventAttributes['exception.stacktrace'];
    if (typeof stack === 'string') eventAttributes['exception.stacktrace'] = framesOnly(stack);
  }
}
