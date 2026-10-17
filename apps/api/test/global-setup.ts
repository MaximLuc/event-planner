import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

type TestGlobal = typeof globalThis & {
  testPostgresContainer?: StartedPostgreSqlContainer;
  testRedisContainer?: StartedTestContainer;
};

const testGlobal = globalThis as TestGlobal;

export default async function globalSetup(): Promise<void> {
  try {
    const container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('event_planner_test')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();

    testGlobal.testPostgresContainer = container;

    const redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();

    testGlobal.testRedisContainer = redisContainer;

    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

    process.env.JWT_ACCESS_SECRET =
      'test-access-secret-at-least-32-characters-long';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';

    process.env.JWT_REFRESH_SECRET =
      'test-refresh-secret-at-least-32-characters-long';
    process.env.JWT_REFRESH_TTL_SECONDS = '2592000';

    const apiDirectory = path.resolve(__dirname, '..');

    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: apiDirectory,
      env: process.env,
      stdio: 'inherit',
    });
  } catch (error: unknown) {
    await Promise.allSettled([
      testGlobal.testRedisContainer?.stop(),
      testGlobal.testPostgresContainer?.stop(),
    ]);

    throw error;
  }
}
