import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedTestContainer } from 'testcontainers';

type TestGlobal = typeof globalThis & {
  testPostgresContainer?: StartedPostgreSqlContainer;
  testRedisContainer?: StartedTestContainer;
};

const testGlobal = globalThis as TestGlobal;

export default async function globalTeardown(): Promise<void> {
  await Promise.all([
    testGlobal.testRedisContainer?.stop(),
    testGlobal.testPostgresContainer?.stop(),
  ]);
}
