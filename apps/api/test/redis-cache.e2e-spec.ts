/// <reference types="jest" />

import { createClient } from '@keyv/redis';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import {
  EventStatus,
  EventVisibility,
  ParticipationPolicy,
} from '../src/generated/prisma/enums';
import { createAccessToken } from './helpers/auth.helper';
import { createTestApp } from './helpers/create-test-app';
import { resetTestState } from './helpers/reset-test-state';
import { createTestUser } from './helpers/factories';

type PublicEventResponse = {
  title: string;
  slug: string;
  startsAt: string;
  endsAt: string;
  owner: { name: string };
};

type CatalogResponse = {
  items: PublicEventResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type EventOptions = {
  title?: string;
  slug?: string;
  startsAt?: Date;
  status?: EventStatus;
  visibility?: EventVisibility;
  participationPolicy?: ParticipationPolicy;
};

type QueryCase = {
  query: Record<string, string | number>;
  slugs: string[];
  total: number;
};

describe('Redis cache (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cache: Cache;
  let redis: ReturnType<typeof createClient>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    cache = app.get<Cache>(CACHE_MANAGER);
    redis = createClient({
      url: app.get(ConfigService).getOrThrow<string>('REDIS_URL'),
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
      if (redis?.isOpen) {
        await redis.quit();
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  function createEvent(ownerId: string, options: EventOptions = {}) {
    const startsAt = options.startsAt ?? new Date(Date.now() + 86_400_000);
    const status = options.status ?? EventStatus.PUBLISHED;

    return prisma.event.create({
      data: {
        ownerId,
        title: options.title ?? 'Board Games Evening',
        slug: options.slug ?? `cache-event-${randomUUID()}`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        status,
        visibility: options.visibility ?? EventVisibility.PUBLIC,
        participationPolicy:
          options.participationPolicy ?? ParticipationPolicy.OPEN_REGISTRATION,
        publishedAt: status === EventStatus.PUBLISHED ? new Date() : null,
      },
    });
  }

  function getCatalog(query: Record<string, string | number> = {}) {
    return request(app.getHttpServer())
      .get('/api/v1/public/events')
      .query(query)
      .expect(200);
  }

  async function findRedisKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    for await (const batch of redis.scanIterator({ MATCH: pattern })) {
      keys.push(...batch);
    }
    return keys;
  }

  it('serves a repeated catalog request without reading PostgreSQL again', async () => {
    const owner = await createTestUser(prisma);
    const event = await createEvent(owner.id);
    const findMany = jest.spyOn(prisma.event, 'findMany');
    const count = jest.spyOn(prisma.event, 'count');

    const firstResponse = await getCatalog();
    const secondResponse = await getCatalog();
    const body = secondResponse.body as CatalogResponse;

    expect(body.items.map((item) => item.slug)).toEqual([event.slug]);
    expect(secondResponse.body).toEqual(firstResponse.body);
    expect(body.items[0]?.startsAt).toBe(event.startsAt?.toISOString());
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('shares a cache key for search terms differing only in case and whitespace', async () => {
    const owner = await createTestUser(prisma);
    await createEvent(owner.id);
    const findMany = jest.spyOn(prisma.event, 'findMany');

    const firstResponse = await getCatalog({ search: 'games' });
    const secondResponse = await getCatalog({ search: '  GAMES  ' });

    expect(secondResponse.body).toEqual(firstResponse.body);
    expect((secondResponse.body as CatalogResponse).items).toHaveLength(1);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    'search',
    'dateFrom',
    'dateTo',
    'participationPolicy',
    'page',
    'limit',
  ] as const)(
    'keeps different %s query values in separate cache entries',
    async (filter) => {
      const owner = await createTestUser(prisma);
      const firstStart = new Date(Date.now() + 86_400_000);
      const secondStart = new Date(firstStart.getTime() + 86_400_000);
      const thirdStart = new Date(secondStart.getTime() + 86_400_000);
      const first = await createEvent(owner.id, { startsAt: firstStart });
      const second = await createEvent(owner.id, {
        startsAt: secondStart,
        participationPolicy: ParticipationPolicy.APPROVAL_REQUIRED,
      });
      const third = await createEvent(owner.id, {
        title: 'Music Night',
        startsAt: thirdStart,
      });
      const cases: Record<typeof filter, [QueryCase, QueryCase]> = {
        search: [
          {
            query: { search: 'games' },
            slugs: [first.slug, second.slug],
            total: 2,
          },
          { query: { search: 'music' }, slugs: [third.slug], total: 1 },
        ],
        dateFrom: [
          {
            query: { dateFrom: secondStart.toISOString() },
            slugs: [second.slug, third.slug],
            total: 2,
          },
          {
            query: { dateFrom: thirdStart.toISOString() },
            slugs: [third.slug],
            total: 1,
          },
        ],
        dateTo: [
          {
            query: { dateTo: firstStart.toISOString() },
            slugs: [first.slug],
            total: 1,
          },
          {
            query: { dateTo: secondStart.toISOString() },
            slugs: [first.slug, second.slug],
            total: 2,
          },
        ],
        participationPolicy: [
          {
            query: {
              participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
            },
            slugs: [first.slug, third.slug],
            total: 2,
          },
          {
            query: {
              participationPolicy: ParticipationPolicy.APPROVAL_REQUIRED,
            },
            slugs: [second.slug],
            total: 1,
          },
        ],
        page: [
          { query: { page: 1, limit: 1 }, slugs: [first.slug], total: 3 },
          { query: { page: 2, limit: 1 }, slugs: [second.slug], total: 3 },
        ],
        limit: [
          { query: { limit: 1 }, slugs: [first.slug], total: 3 },
          { query: { limit: 2 }, slugs: [first.slug, second.slug], total: 3 },
        ],
      };
      const findMany = jest.spyOn(prisma.event, 'findMany');
      const count = jest.spyOn(prisma.event, 'count');

      for (let pass = 0; pass < 2; pass++) {
        for (const testCase of cases[filter]) {
          const response = await getCatalog(testCase.query);
          const body = response.body as CatalogResponse;
          expect(body.items.map((item) => item.slug)).toEqual(testCase.slugs);
          expect(body.pagination.total).toBe(testCase.total);
        }
      }

      expect(findMany).toHaveBeenCalledTimes(2);
      expect(count).toHaveBeenCalledTimes(2);
    },
  );

  it('caches detail responses separately by slug and preserves public fields', async () => {
    const owner = await createTestUser(prisma);
    const first = await createEvent(owner.id);
    const second = await createEvent(owner.id, { title: 'Another event' });
    const findFirst = jest.spyOn(prisma.event, 'findFirst');

    for (const event of [first, second]) {
      const firstResponse = await request(app.getHttpServer())
        .get(`/api/v1/public/events/${event.slug}`)
        .expect(200);
      const cachedResponse = await request(app.getHttpServer())
        .get(`/api/v1/public/events/${event.slug}`)
        .expect(200);
      const body = cachedResponse.body as PublicEventResponse;

      expect(cachedResponse.body).toEqual(firstResponse.body);
      expect(body.title).toBe(event.title);
      expect(body.slug).toBe(event.slug);
      expect(body.startsAt).toBe(event.startsAt?.toISOString());
      expect(body.owner).toEqual({ name: owner.name });
      expect(body).not.toHaveProperty('ownerId');
      expect(body).not.toHaveProperty('version');
      expect(body.owner).not.toHaveProperty('email');
    }

    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it.each(['list', 'detail'] as const)(
    'stores %s entries in Redis for 60 seconds and reloads them after expiry',
    async (kind) => {
      const owner = await createTestUser(prisma);
      const event = await createEvent(owner.id);
      const url =
        kind === 'list'
          ? '/api/v1/public/events'
          : `/api/v1/public/events/${event.slug}`;
      const querySpy =
        kind === 'list'
          ? jest.spyOn(prisma.event, 'findMany')
          : jest.spyOn(prisma.event, 'findFirst');

      await request(app.getHttpServer()).get(url).expect(200);
      const keys = await findRedisKeys(`event-planner*public-events:${kind}:*`);
      expect(keys).toHaveLength(1);
      const [key] = keys;
      if (!key) throw new Error('Redis cache entry was not created');

      const ttl = await redis.pTTL(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60_000);

      await prisma.event.update({
        where: { id: event.id },
        data: { title: 'Fresh title after expiry' },
      });
      expect(await redis.pExpire(key, 1)).toBe(1);
      const deadline = Date.now() + 5_000;
      while ((await redis.exists(key)) !== 0 && Date.now() < deadline) {
        await delay(20);
      }
      expect(await redis.exists(key)).toBe(0);

      const response = await request(app.getHttpServer()).get(url).expect(200);
      const freshEvent =
        kind === 'list'
          ? (response.body as CatalogResponse).items[0]
          : (response.body as PublicEventResponse);
      expect(freshEvent?.title).toBe('Fresh title after expiry');
      expect(querySpy).toHaveBeenCalledTimes(2);
    },
  );

  it('invalidates all cached catalog variants after public publication without clearing unrelated keys', async () => {
    const owner = await createTestUser(prisma);
    const event = await createEvent(owner.id, { status: EventStatus.DRAFT });
    const accessToken = await createAccessToken(app, owner.id);
    const findMany = jest.spyOn(prisma.event, 'findMany');
    const queries: Array<Record<string, string | number>> = [
      { page: 1, limit: 10 },
      { search: 'games', page: 1, limit: 1 },
    ];
    await cache.set('unrelated-test-key', 'keep-me', 60_000);

    for (const query of queries) {
      const response = await getCatalog(query);
      expect((response.body as CatalogResponse).items).toEqual([]);
      expect((response.body as CatalogResponse).pagination.total).toBe(0);
      expect((await getCatalog(query)).body).toEqual(response.body);
    }
    expect(findMany).toHaveBeenCalledTimes(2);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ expectedVersion: event.version })
      .expect(201);

    for (const query of queries) {
      const response = await getCatalog(query);
      const body = response.body as CatalogResponse;
      expect(body.items.map((item) => item.slug)).toEqual([event.slug]);
      expect(body.pagination.total).toBe(1);
      expect((await getCatalog(query)).body).toEqual(response.body);
    }
    expect(findMany).toHaveBeenCalledTimes(4);
    expect(await cache.get<string>('unrelated-test-key')).toBe('keep-me');

    const [revisionKey] = await findRedisKeys(
      'event-planner*public-events:list:revision',
    );
    if (!revisionKey) throw new Error('Catalog revision was not stored');
    expect(await redis.pTTL(revisionKey)).toBe(-1);
  });

  it.each([EventVisibility.PRIVATE, EventVisibility.UNLISTED])(
    'does not invalidate the catalog when publishing a %s event',
    async (visibility) => {
      const owner = await createTestUser(prisma);
      const event = await createEvent(owner.id, {
        status: EventStatus.DRAFT,
        visibility,
      });
      const accessToken = await createAccessToken(app, owner.id);
      const findMany = jest.spyOn(prisma.event, 'findMany');
      const before = await getCatalog();

      await request(app.getHttpServer())
        .post(`/api/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedVersion: event.version })
        .expect(201);

      const after = await getCatalog();
      expect(after.body).toEqual(before.body);
      expect((after.body as CatalogResponse).items).toEqual([]);
      expect(findMany).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the cached catalog when publication fails', async () => {
    const owner = await createTestUser(prisma);
    const event = await createEvent(owner.id, { status: EventStatus.DRAFT });
    const accessToken = await createAccessToken(app, owner.id);
    const findMany = jest.spyOn(prisma.event, 'findMany');
    const before = await getCatalog();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ expectedVersion: event.version + 1 })
      .expect(409);

    expect((await getCatalog()).body).toEqual(before.body);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it.each([EventVisibility.PUBLIC, EventVisibility.UNLISTED])(
    'does not cache 404 responses before a %s event is created and published',
    async (visibility) => {
      const owner = await createTestUser(prisma);
      const slug = `new-event-${randomUUID()}`;
      const url = `/api/v1/public/events/${slug}`;
      const accessToken = await createAccessToken(app, owner.id);
      const findFirst = jest.spyOn(prisma.event, 'findFirst');

      await request(app.getHttpServer()).get(url).expect(404);
      const event = await createEvent(owner.id, {
        slug,
        visibility,
        status: EventStatus.DRAFT,
      });
      await request(app.getHttpServer()).get(url).expect(404);

      await request(app.getHttpServer())
        .post(`/api/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedVersion: event.version })
        .expect(201);

      const response = await request(app.getHttpServer()).get(url).expect(200);
      expect((response.body as PublicEventResponse).slug).toBe(slug);
      expect(
        (await request(app.getHttpServer()).get(url).expect(200)).body,
      ).toEqual(response.body);
      expect(findFirst).toHaveBeenCalledTimes(3);
    },
  );

  it('does not cache or expose a published private event', async () => {
    const owner = await createTestUser(prisma);
    const event = await createEvent(owner.id, {
      visibility: EventVisibility.PRIVATE,
    });
    const findFirst = jest.spyOn(prisma.event, 'findFirst');

    await request(app.getHttpServer())
      .get(`/api/v1/public/events/${event.slug}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/public/events/${event.slug}`)
      .expect(404);

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(await findRedisKeys('event-planner*public-events:detail:*')).toEqual(
      [],
    );
  });
});
