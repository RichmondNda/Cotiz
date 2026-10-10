import { createServer } from 'node:net';
import { Counter, Registry } from 'prom-client';
import { afterEach, describe, expect, it } from 'vitest';
import { MetricsServer } from './metrics-server.js';

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => {
        resolve(port);
      });
    });
  });

describe('MetricsServer', () => {
  let server: MetricsServer | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  async function start(port: number) {
    const registry = new Registry();
    new Counter({ name: 'cotiz_probe_total', help: 'sonde', registers: [registry] }).inc(3);
    server = new MetricsServer(registry, { host: '127.0.0.1', port });
    await server.start();
    return registry;
  }

  it('sert les métriques au format Prometheus sur GET /metrics', async () => {
    const port = await freePort();
    await start(port);
    const res = await fetch(`http://127.0.0.1:${String(port)}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toMatch(/^cotiz_probe_total 3$/m);
  });

  it('ne sert rien d’autre', async () => {
    const port = await freePort();
    await start(port);
    expect((await fetch(`http://127.0.0.1:${String(port)}/`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${String(port)}/metrics/x`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${String(port)}/metrics`, { method: 'POST' })).status).toBe(405);
  });

  it('port 0 : désactivé, aucun serveur', async () => {
    await start(0);
    expect(server?.address()).toBeNull();
  });

  it('port occupé : le processus continue (les métriques ne sont jamais vitales)', async () => {
    const port = await freePort();
    const busy = createServer().listen(port, '127.0.0.1');
    await new Promise((resolve) => busy.once('listening', resolve));
    try {
      await expect(start(port)).resolves.toBeDefined();
      expect(server?.address()).toBeNull();
    } finally {
      busy.close();
    }
  });
});
