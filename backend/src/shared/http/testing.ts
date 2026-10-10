import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

/** Réponse HTTP minimale enregistrée par les tests unitaires des intercepteurs et du filtre. */
export class FakeResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  body: unknown;
  contentType: string | undefined;
  status(code: number): this {
    this.statusCode = code;
    return this;
  }
  type(contentType: string): this {
    this.contentType = contentType;
    return this;
  }
  json(body: unknown): void {
    this.body = body;
  }
  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }
  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }
}

export interface FakeRequest {
  method: string;
  url: string;
  ip?: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
}

/** Méthode de route d'une classe de test, comme Nest la passe au contexte (pour ses métadonnées). */
export function routeHandler(controller: new () => object, name: string): object {
  const handler = (controller.prototype as Record<string, unknown>)[name];
  if (typeof handler !== 'function') throw new Error(`route inconnue : ${name}`);
  return handler;
}

/** Contexte d'exécution HTTP d'un gestionnaire de route (méthode décorée d'une classe de test). */
export function httpContext(
  handler: object,
  controller: new (...args: never[]) => unknown,
  request: FakeRequest,
  response = new FakeResponse(),
): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => controller,
    getArgs: () => [request, response],
    getArgByIndex: (i: number) => [request, response][i],
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
    switchToRpc: () => {
      throw new Error('http seulement');
    },
    switchToWs: () => {
      throw new Error('http seulement');
    },
  } as unknown as ExecutionContext;
}

/** Gestionnaire de route simulé : compte ses appels et renvoie `result` (ou lève `error`). */
export function fakeHandler(result: unknown = { ok: true }, error?: unknown): CallHandler & { calls: number } {
  const handler = {
    calls: 0,
    handle: () =>
      new Observable((subscriber) => {
        handler.calls++;
        if (error !== undefined) subscriber.error(error);
        else {
          subscriber.next(result);
          subscriber.complete();
        }
      }),
  };
  return handler;
}
