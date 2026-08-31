import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

type TestGlobal = typeof globalThis & {
  testPostgresContainer?: StartedPostgreSqlContainer;
};

const testGlobal = globalThis as TestGlobal;

export default async function globalTeardown(): Promise<void> {
  await testGlobal.testPostgresContainer?.stop();
}
