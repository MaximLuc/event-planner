/// <reference types="jest" />
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './helpers/create-test-app';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { cleanCache } from './helpers/cache.helper';
import { cleanRateLimits } from './helpers/rate-limit.helper';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let cache: Cache;

  beforeAll(async () => {
    app = await createTestApp();
    cache = app.get<Cache>(CACHE_MANAGER);
  });

  beforeEach(async () => {
    await cleanCache(app);
    await cleanRateLimits(app);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('checks Redis and removes the temporary health key', async () => {
    const set = jest.spyOn(cache, 'set');
    await request(app.getHttpServer())
      .get('/api/v1/health/redis')
      .expect(200)
      .expect({ status: 'ok', redis: 'connected' });

    expect(set).toHaveBeenCalledTimes(1);
    const key = set.mock.calls[0]?.[0];
    if (!key) throw new Error('Redis health check did not write a key');
    expect(await cache.get(key)).toBeUndefined();
  });

  it('returns 503 when the cache write fails', async () => {
    jest
      .spyOn(cache, 'set')
      .mockRejectedValueOnce(new Error('Simulated Redis failure'));

    await request(app.getHttpServer())
      .get('/api/v1/health/redis')
      .expect(503)
      .expect({
        statusCode: 503,
        message: 'Redis is unavailable',
        error: 'Service Unavailable',
      });
  });

  it('returns 503 when Redis does not return the value just written', async () => {
    jest.spyOn(cache, 'get').mockResolvedValueOnce(undefined);

    await request(app.getHttpServer()).get('/api/v1/health/redis').expect(503);
  });
});
