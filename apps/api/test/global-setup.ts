import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

type TestGlobal = typeof globalThis & {
  testPostgresContainer?: StartedPostgreSqlContainer;
};

const testGlobal = globalThis as TestGlobal;

export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('event_planner_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  testGlobal.testPostgresContainer = container;

  process.env.NODE_ENV = 'test';
  process.env.PORT = '3001';
  process.env.DATABASE_URL = container.getConnectionUri();

  process.env.JWT_ACCESS_SECRET =
    'test-access-secret-at-least-32-characters-long';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';

  process.env.JWT_REFRESH_SECRET =
    'test-refresh-secret-at-least-32-characters-long';
  process.env.JWT_REFRESH_TTL_SECONDS = '2592000';

  const apiDirectory = path.resolve(__dirname, '..');

  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: apiDirectory,
      env: process.env,
      stdio: 'inherit',
    });
  } catch (error: unknown) {
    await container.stop();
    throw error;
  }
}
