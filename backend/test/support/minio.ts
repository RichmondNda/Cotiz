import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { BUCKETS } from '../../src/shared/storage/index.js';

export interface TestMinio {
  container: StartedTestContainer;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  stop(): Promise<void>;
}

/** MinIO de test (même image que infra/compose/local.yml), compartiments de architecture/08 créés. */
export async function startMinio(): Promise<TestMinio> {
  const accessKeyId = 'cotiz';
  const secretAccessKey = 'cotiz-test-minio';
  const container = await new GenericContainer('cgr.dev/chainguard/minio:latest')
    .withCommand(['server', '/data'])
    .withEnvironment({ MINIO_ROOT_USER: accessKeyId, MINIO_ROOT_PASSWORD: secretAccessKey })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
    .start();
  const endpoint = `http://${container.getHost()}:${String(container.getMappedPort(9000))}`;
  const s3 = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  // cotiz-legal : verrouillage d'objet (WORM), comme infra/compose/minio-init/init.sh.
  for (const bucket of new Set(Object.values(BUCKETS))) {
    await s3.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: bucket === 'cotiz-legal' }));
  }
  s3.destroy();
  return {
    container,
    endpoint,
    accessKeyId,
    secretAccessKey,
    stop: async () => {
      await container.stop();
    },
  };
}
