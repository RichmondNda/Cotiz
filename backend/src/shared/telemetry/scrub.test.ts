import { SpanStatusCode } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import { MASKED } from '../logging/index.js';
import { scrubSpanData } from './scrub.js';

const span = (attributes: Record<string, unknown>, message?: string, stacktrace?: string) => ({
  attributes,
  events: [
    {
      name: 'exception',
      attributes: {
        'exception.message': message ?? 'boum',
        'exception.type': 'Error',
        ...(stacktrace ? { 'exception.stacktrace': stacktrace } : {}),
      },
    },
  ],
  status: { code: SpanStatusCode.ERROR, message },
});

const AID = '00000000-0000-7000-8000-0000000ab001';

describe('scrubSpanData (traces exportées)', () => {
  it('span HTTP serveur (attributs réels d’instrumentation-http 0.223) : ni IP, ni user-agent, ni query, ni chemin réel', () => {
    const s = span({
      'http.request.method': 'GET',
      'http.route': '/api/v1/associations/:aid/members',
      'url.path': `/api/v1/associations/${AID}/members`,
      'url.query': 'code=482913',
      'url.scheme': 'http',
      'client.address': '41.202.10.7',
      'network.peer.address': '10.0.0.2',
      'network.peer.port': 51234,
      'user_agent.original': 'Mozilla/5.0',
      'http.response.status_code': 200,
      'cotiz.request_id': 'req-1',
    });
    scrubSpanData(s);
    expect(s.attributes).toEqual({
      'http.request.method': 'GET',
      'http.route': '/api/v1/associations/:aid/members',
      'url.path': '/api/v1/associations/:aid/members',
      'url.scheme': 'http',
      'http.response.status_code': 200,
      'cotiz.request_id': 'req-1',
    });
  });

  it('sans route gabarit (404) : le chemin réel est retiré', () => {
    const s = span({ 'url.path': `/api/v1/inconnu/${AID}` });
    scrubSpanData(s);
    expect(s.attributes).toEqual({});
  });

  it('appel sortant : URL gardée sans query string (signature, code)', () => {
    const s = span({ 'url.full': 'http://minio:9000/proofs/x.pdf?X-Amz-Signature=abc&code=482913' });
    scrubSpanData(s);
    expect(s.attributes).toEqual({ 'url.full': 'http://minio:9000/proofs/x.pdf' });
  });

  it('span PostgreSQL (attributs réels de pg 0.75) : jamais le message d’erreur, ni les paramètres', () => {
    const s = span(
      {
        'db.system.name': 'postgresql',
        'db.query.text': 'insert into x values ($1)',
        'db.query.parameter.0': '482913',
      },
      'invalid input syntax for type uuid: "482913"',
    );
    scrubSpanData(s);
    expect(JSON.stringify(s)).not.toContain('482913');
    expect(s.attributes['db.query.text']).toBe('insert into x values ($1)');
    expect(s.status.message).toBeUndefined();
  });

  it('pile d’exception réduite à ses cadres (sa 1re ligne répète le message)', () => {
    const s = span(
      { 'db.system.name': 'redis' },
      'ERR',
      'Error: pas de compte pour +2250707070707\n    at run (x.ts:1:1)',
    );
    scrubSpanData(s);
    expect(s.events[0]?.attributes['exception.stacktrace']).toBe('    at run (x.ts:1:1)');
  });

  it('autre span : message d’erreur gardé, téléphones masqués, champs sensibles masqués', () => {
    const s = span(
      { 'cotiz.request_id': 'req-1', 'enduser.phone': '+2250707070707' },
      'pas de compte pour +2250707070707',
    );
    scrubSpanData(s);
    expect(s.status.message).toBe(`pas de compte pour ${MASKED}`);
    expect(s.events[0]?.attributes['exception.message']).toBe(`pas de compte pour ${MASKED}`);
    expect(s.attributes).toEqual({ 'cotiz.request_id': 'req-1', 'enduser.phone': MASKED });
  });
});
