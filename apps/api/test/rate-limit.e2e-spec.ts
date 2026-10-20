/// <reference types="jest" />

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import Redis from 'ioredis';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { cleanCache } from './helpers/cache.helper';
import { createTestApp } from './helpers/create-test-app';
import { resetTestState } from './helpers/reset-test-state';
import { cleanRateLimits } from './helpers/rate-limit.helper';

const RATE_LIMIT_KEY_PATTERN = 'event-planner:rate-limit:*';
const INVALID_CREDENTIALS = {
  email: 'participant@example.com',
  password: 'wrong-password',
};

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;
  let cache: Cache;
  let redis: Redis;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
    cache = app.get<Cache>(CACHE_MANAGER);
    redis = new Redis(app.get(ConfigService).getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
    });
    await redis.connect();
  });

  beforeEach(async () => {
    await resetTestState(app);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      if (redis) {
        redis.disconnect();
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  function attemptLogin(instance: INestApplication<App> = app) {
    return request(instance.getHttpServer())
      .post('/api/v1/auth/login')
      .send(INVALID_CREDENTIALS);
  }

  async function exhaustLoginLimit(): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      await attemptLogin().expect(401);
    }
    await attemptLogin().expect(429);
  }

  async function findRateLimitKeys(): Promise<string[]> {
    const keys = new Set<string>();
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(
        cursor,
        'MATCH',
        RATE_LIMIT_KEY_PATTERN,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      for (const key of batch) keys.add(key);
    } while (cursor !== '0');
    return [...keys].sort();
  }

  async function expireKeys(keys: string[]): Promise<void> {
    for (const key of keys) {
      expect(await redis.pexpire(key, 1)).toBe(1);
    }
    const deadline = Date.now() + 5_000;
    while ((await redis.exists(...keys)) > 0 && Date.now() < deadline) {
      await delay(20);
    }
    expect(await redis.exists(...keys)).toBe(0);
  }

  it('blocks the sixth login attempt before checking credentials and creating a session', async () => {
    const password = 'correct-password';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: INVALID_CREDENTIALS.email, name: 'Participant', password })
      .expect(201);
    const login = jest.spyOn(authService, 'login');

    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await attemptLogin().expect(401);
      expect(response.headers['x-ratelimit-limit']).toBe('5');
      expect(response.headers['x-ratelimit-remaining']).toBe(
        String(4 - attempt),
      );
    }

    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: INVALID_CREDENTIALS.email, password })
      .expect(429);
    const retryAfter: unknown = blocked.headers['retry-after'];

    expect(retryAfter).toEqual(expect.any(String));
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(Number(retryAfter)).toBeLessThanOrEqual(60);
    expect(login).toHaveBeenCalledTimes(5);
    expect(await prisma.session.count()).toBe(0);
  });

  it('allows three registrations and rejects the fourth without saving its user', async () => {
    const register = jest.spyOn(authService, 'register');
    for (let index = 0; index < 3; index++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `participant-${index}@example.com`,
          name: 'Participant',
          password: 'correct-password',
        })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'blocked@example.com',
        name: 'Blocked Participant',
        password: 'correct-password',
      })
      .expect(429);

    expect(register).toHaveBeenCalledTimes(3);
    expect(await prisma.user.count()).toBe(3);
    expect(
      await prisma.user.findUnique({ where: { email: 'blocked@example.com' } }),
    ).toBeNull();
  });

  it('counts requests rejected by DTO validation toward the registration limit', async () => {
    const register = jest.spyOn(authService, 'register');
    for (let attempt = 0; attempt < 3; attempt++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({})
        .expect(400);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({})
      .expect(429);

    expect(register).not.toHaveBeenCalled();
    expect(await prisma.user.count()).toBe(0);
  });

  it('limits cached catalog requests and does not reset the limit for new query parameters', async () => {
    const findMany = jest.spyOn(prisma.event, 'findMany');
    for (let attempt = 0; attempt < 60; attempt++) {
      await request(app.getHttpServer())
        .get('/api/v1/public/events')
        .expect(200);
    }

    await request(app.getHttpServer()).get('/api/v1/public/events').expect(429);
    await request(app.getHttpServer())
      .get('/api/v1/public/events')
      .query({ page: 2, limit: 10, search: 'games' })
      .expect(429);

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps login, registration and catalog counters independent', async () => {
    await exhaustLoginLimit();

    await request(app.getHttpServer()).get('/api/v1/public/events').expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'another@example.com',
        name: 'Another Participant',
        password: 'correct-password',
      })
      .expect(201);
    await attemptLogin().expect(429);
  });

  it('does not let the client reset its login limit by changing email or X-Forwarded-For', async () => {
    for (let index = 0; index < 6; index++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `203.0.113.${index + 1}`)
        .send({ ...INVALID_CREDENTIALS, email: `unknown-${index}@example.com` })
        .expect(index < 5 ? 401 : 429);
    }
  });

  it('shares the login counter across two application instances', async () => {
    const anotherApp = await createTestApp();
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        await attemptLogin(app).expect(401);
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        await attemptLogin(anotherApp).expect(401);
      }

      await attemptLogin(app).expect(429);
      await attemptLogin(anotherApp).expect(429);
    } finally {
      await anotherApp.close();
    }
  });

  it('does not allow parallel login attempts to exceed the limit', async () => {
    const login = jest.spyOn(authService, 'login');
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => attemptLogin()),
    );

    expect(
      responses.filter((response) => response.status === 401),
    ).toHaveLength(5);
    expect(
      responses.filter((response) => response.status === 429),
    ).toHaveLength(1);
    expect(login).toHaveBeenCalledTimes(5);
    await attemptLogin().expect(429);
  });

  it('does not reset the login block when the application cache is cleared', async () => {
    await cache.set('test-cache-entry', 'cached-value', 60_000);
    await exhaustLoginLimit();
    const keysBefore = await findRateLimitKeys();
    expect(keysBefore).toHaveLength(2);

    await cleanCache(app);

    expect(await cache.get('test-cache-entry')).toBeUndefined();
    expect(await findRateLimitKeys()).toEqual(keysBefore);
    await attemptLogin().expect(429);
  });

  it('clears test rate limit counters without removing application cache entries', async () => {
    await cache.set('test-cache-entry', 'cached-value', 60_000);
    await exhaustLoginLimit();

    await cleanRateLimits(app);

    expect(await findRateLimitKeys()).toEqual([]);
    expect(await cache.get<string>('test-cache-entry')).toBe('cached-value');
    const response = await attemptLogin().expect(401);
    expect(response.headers['x-ratelimit-remaining']).toBe('4');
  });

  it('stores the hit counter with a 60 second TTL and resets it after expiration', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await attemptLogin().expect(401);
    }

    const keys = await findRateLimitKeys();
    expect(keys).toHaveLength(1);
    const [key] = keys;
    if (!key) throw new Error('Login counter was not stored in Redis');
    expect(key).toMatch(/:hits$/);
    expect(await redis.get(key)).toBe('5');
    const ttl = await redis.pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);

    await expireKeys(keys);

    const response = await attemptLogin().expect(401);
    expect(response.headers['x-ratelimit-remaining']).toBe('4');
  });

  it('allows login attempts again after both the hit counter and block expire', async () => {
    await exhaustLoginLimit();

    const keys = await findRateLimitKeys();
    expect(keys).toHaveLength(2);
    expect(keys.some((key) => key.endsWith(':blocked'))).toBe(true);
    for (const key of keys) {
      const ttl = await redis.pttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60_000);
    }

    await expireKeys(keys);

    const response = await attemptLogin().expect(401);
    expect(response.headers['x-ratelimit-remaining']).toBe('4');
  });

  it('keeps health checks unlimited and does not store counters for them', async () => {
    await exhaustLoginLimit();
    const keysBefore = await findRateLimitKeys();

    for (let attempt = 0; attempt < 61; attempt++) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect({ status: 'ok' });
      expect(response.headers['x-ratelimit-limit']).toBeUndefined();
    }
    await request(app.getHttpServer())
      .get('/api/v1/health/database')
      .expect(200);
    await request(app.getHttpServer()).get('/api/v1/health/redis').expect(200);

    expect(await findRateLimitKeys()).toEqual(keysBefore);
    await attemptLogin().expect(429);
  });
});
