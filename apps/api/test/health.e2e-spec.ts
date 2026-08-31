/// <reference types="jest" />
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './helpers/create-test-app';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns API status', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({
        status: 'ok',
      });
  });

  it('GET /api/v1/health/database checks PostgreSQL', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/database')
      .expect(200)
      .expect({
        status: 'ok',
        database: 'connected',
      });
  });
});
