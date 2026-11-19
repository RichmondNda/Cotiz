import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from '../integration/ledger.fixture.js';
import { PLANS } from '../integration/platform-associations.fixture.js';
import { startMinio, type TestMinio } from '../support/minio.js';

/**
 * Lot 4.6 · étape 3, vérification « 50 000 lignes sans dégrader l'API » : rapport CSV d'un projet de 50 000
 * souscripteurs (une échéance de 25 000 F chacun, 4 sur 5 soldées par un paiement validé), produit par un vrai
 * processus worker (relais outbox → file `exports` → fichier dans cotiz-exports), comme en production où l'api et le
 * worker sont deux processus. Mesures : pic de mémoire résidente du worker pendant l'export (VmHWM, Linux) et p95
 * d'une lecture de l'api (rp.export › get, celle que l'écran relit) avant et pendant l'export.
 *
 * Objectif d'architecture/09 : 95 % des lectures < 300 ms, tenu pendant l'export. Mesuré le 2026-11-15 : export en
 * ≈ 9,5 s, worker +240 Mo au pic, p95 ≈ 115 ms avant et ≈ 200 ms pendant. ANALYZE après chaque chargement : sans
 * statistiques, les contrôles de clés étrangères du chargement suivant deviennent très lents.
 */

const PROJECT = '00000000-0000-7000-8000-00000000e650';
const SUBSCRIBERS = 50_000;
const READ_BUDGET_MS = 300;
/** Mémoire résidente ajoutée au worker démarré (mesuré : ≈ 240 Mo au pic, 2026-11-15) : garde-fou de régression. */
const WORKER_MEMORY_CEILING_MB = 512;
/** Production complète de l'export (lecture, calcul, CSV, dépôt) : garde-fou, pas un objectif. */
const EXPORT_CEILING_MS = 120_000;

const p95 = (samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
};
const kb = (pid: number, field: 'VmRSS' | 'VmHWM') =>
  Number(new RegExp(`${field}:\\s+(\\d+) kB`).exec(readFileSync(`/proc/${String(pid)}/status`, 'utf8'))?.[1] ?? 0);

describe('export CSV : 50 000 lignes', () => {
  let f: LedgerFixture;
  let minio: TestMinio;
  let worker: ChildProcess;
  let output = '';

  const read = async (id: string) => {
    const started = performance.now();
    const res = await f.call(`/associations/${A.id}/exports/${id}`, { token: f.tokens.awa });
    const elapsed = performance.now() - started;
    expect(res.status).toBe(200);
    return { body: (await res.json()) as { status: string; fileId: string | null }, elapsed };
  };

  beforeAll(async () => {
    minio = await startMinio();
    const storage = {
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
    };
    f = await startLedgerFixture({ ...storage, RATE_LIMIT_ASSOCIATION_PER_MIN: '100000' });
    await f.h.superuser('UPDATE plans SET max_subscribers = 100000, features = $2 WHERE id = $1', [
      PLANS.essentiel,
      ['exports'],
    ]);
    await f.h.superuser(
      `INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency, due_day,
                             schedule_type, start_date, end_date, created_by)
       VALUES ($1, $2, 'Charge 50 000', '', 'active', 25000, 'monthly', 5, 'fixed', '2025-01-01', '2025-01-31', $3)`,
      [PROJECT, A.id, USERS.awa],
    );
    await f.h.superuser(
      `CREATE TABLE load_people AS
         SELECT n, gen_random_uuid() AS user_id, gen_random_uuid() AS enrollment_id, gen_random_uuid() AS installment_id
           FROM generate_series(1, $1::int) AS n`,
      [SUBSCRIBERS],
    );
    await f.h.superuser(
      `INSERT INTO users (id, first_name, last_name, phone_e164, status)
       SELECT user_id, 'Charge ' || n, 'Annan', '+2250761' || lpad(n::text, 6, '0'), 'active' FROM load_people`,
    );
    await f.h.superuser('ANALYZE');
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       SELECT gen_random_uuid(), $1, user_id, 'subscriber', 'active', '2025-01-01' FROM load_people`,
      [A.id],
    );
    await f.h.superuser('ANALYZE');
    await f.h.superuser(
      `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at)
       SELECT enrollment_id, $1, $2, user_id, 'active', '2025-01-01', '2025-01-01' FROM load_people`,
      [A.id, PROJECT],
    );
    await f.h.superuser('ANALYZE');
    await f.h.superuser(
      `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                 amount_due, amount_paid, status, paid_at)
       SELECT installment_id, $1, $2, enrollment_id, user_id, 'periodic', 1, '2025-01-05', 25000,
              CASE WHEN n % 5 <> 0 THEN 25000 ELSE 0 END,
              (CASE WHEN n % 5 <> 0 THEN 'paid' ELSE 'late' END)::installments_status,
              CASE WHEN n % 5 <> 0 THEN timestamptz '2025-01-06' END
         FROM load_people`,
      [A.id, PROJECT],
    );
    await f.h.superuser('ANALYZE');
    // Paiements et répartitions cohérents par construction (un paiement validé de 25 000 F, une répartition
    // confirmée), posés sans les déclencheurs (plusieurs instructions, donc sans paramètres) : le contrôle différé de
    // la somme relit `allocations` par payment_id sans index complet (un parcours de table par paiement), trop long
    // pour 40 000 paiements (.claude/notes/a-verifier.md).
    await f.h.superuser(
      `BEGIN; SET LOCAL session_replication_role = replica;
       WITH paid AS (SELECT gen_random_uuid() AS payment_id, * FROM load_people WHERE n % 5 <> 0),
       p AS (
         INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared, paid_on,
                               transaction_reference, status, declared_at, reviewed_by, reviewed_at, idempotency_key)
         SELECT payment_id, '${A.id}', '${PROJECT}', enrollment_id, user_id, 25000, '2025-01-05', 'REF-42', 'validated', '2025-01-05',
                '${USERS.awa}', '2025-01-06', payment_id::text
           FROM paid
         RETURNING id)
       INSERT INTO allocations (id, association_id, payment_id, installment_id, enrollment_id, amount, state, created_at)
       SELECT gen_random_uuid(), '${A.id}', paid.payment_id, paid.installment_id, paid.enrollment_id, 25000, 'confirmed',
              '2025-01-06'
         FROM paid JOIN p ON p.id = paid.payment_id; COMMIT;`,
    );
    await f.h.superuser('DROP TABLE load_people');
    await f.h.superuser('ANALYZE');

    worker = spawn(
      process.execPath,
      ['--conditions=development', '--import', '@swc-node/register/esm-register', 'src/worker.ts'],
      {
        cwd: new URL('../..', import.meta.url),
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST'))),
          NODE_ENV: 'development',
          LOG_LEVEL: 'info',
          LOG_PRETTY: 'false',
          WORKER_METRICS_PORT: '0',
          DATABASE_URL: f.h.db.urlFor('cotiz_app'),
          REDIS_URL: f.redis.getConnectionUrl(),
          OUTBOX_RELAY_INTERVAL_MS: '200',
          ...storage,
        },
      },
    );
    worker.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    worker.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    let exited: number | null | undefined;
    worker.once('exit', (code) => (exited = code));
    for (let i = 0; i < 1_200 && !output.includes('worker prêt') && exited === undefined; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(output, `worker arrêté (${String(exited)})`).toContain('worker prêt');
  }, 600_000);

  afterAll(async () => {
    worker.kill('SIGTERM');
    await f.stop();
    await minio.stop();
  });

  it('jeu de charge : 50 000 souscripteurs inscrits, 40 000 paiements validés', async () => {
    const { rows } = await f.h.superuser(
      `SELECT (SELECT count(*)::int FROM enrollments WHERE project_id = $1) AS enrollments,
              (SELECT count(*)::int FROM payments WHERE project_id = $1) AS payments`,
      [PROJECT],
    );
    expect(rows[0]).toEqual({ enrollments: SUBSCRIBERS, payments: (SUBSCRIBERS * 4) / 5 });
  });

  it(`50 000 lignes, mémoire du worker bornée, p95 de l'api < ${String(READ_BUDGET_MS)} ms pendant l'export`, async () => {
    const res = await f.call(`/associations/${A.id}/exports`, {
      method: 'POST',
      token: f.tokens.awa,
      body: { kind: 'project_report_csv', projectId: PROJECT },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };

    // Référence : lectures juste après la demande (le relais outbox du worker passe toutes les 200 ms).
    const pid = worker.pid ?? 0;
    const before = kb(pid, 'VmRSS');
    const baseline: number[] = [];
    for (let i = 0; i < 5; i++) baseline.push((await read(id)).elapsed);

    const during: number[] = [];
    const started = performance.now();
    let job = await read(id);
    while (job.body.status !== 'done' && job.body.status !== 'failed') {
      expect(performance.now() - started, output.slice(-2_000)).toBeLessThan(EXPORT_CEILING_MS);
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = await read(id);
      during.push(job.elapsed);
    }
    const exportMs = performance.now() - started;
    const peakMb = (kb(pid, 'VmHWM') - before) / 1024;
    console.info(
      `export 50 000 lignes : ${exportMs.toFixed(0)} ms ; worker +${peakMb.toFixed(0)} Mo au pic ; ` +
        `p95 api avant ${p95(baseline).toFixed(0)} ms, pendant ${p95(during).toFixed(0)} ms ` +
        `(${String(during.length)} lectures)`,
    );
    expect(job.body.status, output.slice(-2_000)).toBe('done');
    expect(p95(during)).toBeLessThan(READ_BUDGET_MS);
    expect(peakMb).toBeLessThan(WORKER_MEMORY_CEILING_MB);

    const { bucket, object_key: key } = (
      await f.h.superuser('SELECT bucket, object_key FROM files WHERE id = $1', [job.body.fileId])
    ).rows[0] as { bucket: string; object_key: string };
    const s3 = new S3Client({
      endpoint: minio.endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: minio.accessKeyId, secretAccessKey: minio.secretAccessKey },
    });
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = (await object.Body?.transformToString('utf8')) ?? '';
    s3.destroy();
    const lines = text.split('\r\n').filter((line) => line !== '');
    expect(lines).toHaveLength(SUBSCRIBERS + 1);
    expect(lines.filter((line) => line.includes(';"25000";"25000";"0";"0";'))).toHaveLength((SUBSCRIBERS * 4) / 5);
    expect(lines.filter((line) => line.includes(';"25000";"0";"25000";"1";'))).toHaveLength(SUBSCRIBERS / 5);
  });
});
