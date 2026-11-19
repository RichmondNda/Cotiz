import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ENDPOINTS } from '@cotiz/contracts';
import { expect } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { AnalyzeImportUseCase } from '../../src/modules/imports/application/analyze-import.use-case.js';
import { ClassifyImportUseCase } from '../../src/modules/imports/application/classify-import.use-case.js';
import { ExecuteImportUseCase } from '../../src/modules/imports/application/execute-import.use-case.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, USERS } from '../isolation/harness.js';
import { startMinio, type TestMinio } from '../support/minio.js';
import { type MembersFixture, startMembersFixture } from './members.fixture.js';
import { PLANS } from './platform-associations.fixture.js';

export const Job = ENDPOINTS['im.read'].operations.get.response.body;
export const Rows = ENDPOINTS['im.read'].operations.rows.response.body;
export const Row = ENDPOINTS['im.steps'].operations.row.response.body;
export const CSV = 'text/csv';
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ImportsFixture extends MembersFixture {
  minio: TestMinio;
  worker: INestApplicationContext;
  /** Fichier d'import déposé et analysé sain (ligne `files` + objet dans MinIO), sauf `scanStatus` contraire. */
  upload: (
    content: string | Buffer,
    options?: { aid?: string; mime?: string; purpose?: string; scanStatus?: string; createdAt?: string },
  ) => Promise<string>;
  /** im.flow (clé d'idempotence neuve). */
  flow: (projectId: string, fileId: string, options?: { aid?: string; token?: string }) => Promise<Response>;
  /** im.flow réussi puis analyse par le worker : l'import tel que l'écran le lit. */
  analyzed: (projectId: string, content: string | Buffer, mime?: string) => Promise<ReturnType<typeof Job.parse>>;
  get: (id: string, options?: { aid?: string; token?: string }) => Promise<ReturnType<typeof Job.parse>>;
  rows: (id: string, query?: string) => Promise<ReturnType<typeof Rows.parse>>;
  analyze: (importId: string, aid?: string, now?: Date) => Promise<'done' | 'wait'>;
  classify: (importId: string, aid?: string) => Promise<void>;
  execute: (importId: string, requestedBy?: string, aid?: string) => Promise<void>;
  /** Événements `import.*` écrits pour cet import, dans l'ordre. */
  events: (importId: string) => Promise<{ type: string; payload: Record<string, unknown> }[]>;
  resetImports: () => Promise<void>;
}

export async function startImportsFixture(): Promise<ImportsFixture> {
  const minio = await startMinio();
  const storage = {
    S3_ENDPOINT: minio.endpoint,
    S3_ACCESS_KEY_ID: minio.accessKeyId,
    S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
  };
  const f = await startMembersFixture(storage);
  const worker = await NestFactory.createApplicationContext(
    WorkerModule.register(
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: f.h.db.urlFor('cotiz_app'),
        REDIS_URL: f.redis.getConnectionUrl(),
        OUTBOX_RELAY_INTERVAL_MS: '0',
        ...storage,
      }),
    ),
    { logger: false },
  );
  const s3 = new S3Client({
    endpoint: minio.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: minio.accessKeyId, secretAccessKey: minio.secretAccessKey },
  });

  const upload: ImportsFixture['upload'] = async (content, options = {}) => {
    const id = crypto.randomUUID();
    const aid = options.aid ?? A.id;
    const mime = options.mime ?? CSV;
    const key = `${aid}/import_source/${id}.${mime === CSV ? 'csv' : 'xlsx'}`;
    const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    await s3.send(new PutObjectCommand({ Bucket: 'cotiz-imports', Key: key, Body: body, ContentType: mime }));
    await f.h.superuser(
      `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                          size_bytes, scan_status, sha256, created_at)
       VALUES ($1, $2, $3, $4::files_purpose, 'cotiz-imports', $5, 'membres.csv', $6, $7, $8::files_scan_status,
               CASE WHEN $8 = 'pending' THEN NULL ELSE repeat('0', 64) END, coalesce($9::timestamptz, now()))`,
      [
        id,
        aid,
        USERS.awa,
        options.purpose ?? 'import_source',
        key,
        mime,
        body.length,
        options.scanStatus ?? 'clean',
        options.createdAt ?? null,
      ],
    );
    return id;
  };

  const flow: ImportsFixture['flow'] = (projectId, fileId, options = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/projects/${projectId}/imports`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body: { fileId },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });

  const get: ImportsFixture['get'] = async (id, options = {}) => {
    const res = await f.call(`/associations/${options.aid ?? A.id}/imports/${id}`, {
      token: options.token ?? f.tokens.awa,
    });
    expect(res.status).toBe(200);
    return Job.parse(await res.json());
  };

  const rows: ImportsFixture['rows'] = async (id, query = '') => {
    const res = await f.call(`/associations/${A.id}/imports/${id}/rows${query}`, { token: f.tokens.awa });
    expect(res.status).toBe(200);
    return Rows.parse(await res.json());
  };

  const analyze: ImportsFixture['analyze'] = (importId, aid = A.id, now) =>
    worker.get(AnalyzeImportUseCase).execute({ associationId: aid, importId }, now);
  const classify: ImportsFixture['classify'] = (importId, aid = A.id) =>
    worker.get(ClassifyImportUseCase).execute({ associationId: aid, importId });
  const execute: ImportsFixture['execute'] = (importId, requestedBy = USERS.awa, aid = A.id) =>
    worker.get(ExecuteImportUseCase).execute({ associationId: aid, importId, requestedBy });

  const analyzed: ImportsFixture['analyzed'] = async (projectId, content, mime = CSV) => {
    const res = await flow(projectId, await upload(content, { mime }));
    expect(res.status).toBe(201);
    const { id } = Job.parse(await res.json());
    expect(await analyze(id)).toBe('done');
    return get(id);
  };

  const events: ImportsFixture['events'] = async (importId) =>
    (
      await f.h.superuser(
        `SELECT event_type AS type, payload FROM outbox_events
          WHERE event_type LIKE 'import.%' AND aggregate_id = $1 ORDER BY occurred_at, id`,
        [importId],
      )
    ).rows as { type: string; payload: Record<string, unknown> }[];

  const resetImports = async () => {
    await f.h.superuser(
      `BEGIN; SET LOCAL session_replication_role = replica;
       DELETE FROM import_rows; DELETE FROM import_jobs; DELETE FROM files WHERE purpose = 'import_source';
       DELETE FROM outbox_events WHERE event_type LIKE 'import.%'; COMMIT;`,
    );
    await f.resetMembers();
    await f.h.superuser('UPDATE plans SET features = $2, max_subscribers = 100 WHERE id = $1', [
      PLANS.essentiel,
      ['imports'],
    ]);
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
  };

  return {
    ...f,
    minio,
    worker,
    upload,
    flow,
    analyzed,
    get,
    rows,
    analyze,
    classify,
    execute,
    events,
    resetImports,
    stop: async () => {
      s3.destroy();
      await worker.close();
      await f.stop();
      await minio.stop();
    },
  };
}
