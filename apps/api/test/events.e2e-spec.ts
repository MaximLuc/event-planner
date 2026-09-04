/// <reference types="jest" />

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import {
  EventStatus,
  EventVisibility,
  ParticipationPolicy,
} from '../src/generated/prisma/enums';
import { createTestApp } from './helpers/create-test-app';
import { cleanDatabase } from './helpers/database.helper';
import { createAccessToken } from './helpers/auth.helper';
import { createTestUser } from './helpers/factories';

type EventResponse = {
  id: string;
  ownerId: string;
  title: string;
  slug: string;
  description: string | null;
  status: EventStatus;
  visibility: EventVisibility;
  participationPolicy: ParticipationPolicy;
  capacity: number | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type PublicEventResponse = {
  title: string;
  slug: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  capacity: number | null;
  participationPolicy: ParticipationPolicy;
  owner: {
    name: string;
  };
};

type PublicEventsListResponse = {
  items: PublicEventResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

describe('Events (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('creates an event draft for the authenticated user', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });
    const accessToken = await createAccessToken(app, owner.id);

    const response = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: '  Board Games Evening  ',
        description: '  An informal board games meetup  ',
      })
      .expect(201);

    const body = response.body as EventResponse;

    expect(body.ownerId).toBe(owner.id);
    expect(body.title).toBe('Board Games Evening');
    expect(body.description).toBe('An informal board games meetup');
    expect(body.slug).toMatch(/^board-games-evening-[0-9a-f]{6}$/);

    expect(body.status).toBe(EventStatus.DRAFT);
    expect(body.visibility).toBe(EventVisibility.PRIVATE);
    expect(body.participationPolicy).toBe(ParticipationPolicy.INVITE_ONLY);
    expect(body.version).toBe(1);

    expect(body.capacity).toBeNull();
    expect(body.startsAt).toBeNull();
    expect(body.endsAt).toBeNull();
    expect(body.publishedAt).toBeNull();
    expect(body.timezone).toBe('Europe/Moscow');

    const event = await prisma.event.findUnique({
      where: {
        id: body.id,
      },
    });

    if (!event) {
      throw new Error('Created event was not saved');
    }

    expect(event.ownerId).toBe(owner.id);
    expect(event.slug).toBe(body.slug);
    expect(event.status).toBe(EventStatus.DRAFT);
  });

  it('returns 401 when creating an event without an access token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/events')
      .send({
        title: 'Board Games Evening',
        description: 'An informal board games meetup',
      })
      .expect(401);

    const eventsCount = await prisma.event.count();
    expect(eventsCount).toBe(0);
  });

  it('returns only events owned by the authenticated user', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });
    const anotherOwner = await createTestUser(prisma, {
      email: 'another-owner@example.com',
      name: 'Another Owner',
    });
    const accessToken = await createAccessToken(app, owner.id);

    const olderEvent = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Older event',
        slug: 'older-event',
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
      },
    });
    const newerEvent = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Newer event',
        slug: 'newer-event',
        updatedAt: new Date('2026-08-02T10:00:00.000Z'),
      },
    });
    const anotherOwnersEvent = await prisma.event.create({
      data: {
        ownerId: anotherOwner.id,
        title: 'Another owner event',
        slug: 'another-owner-event',
        updatedAt: new Date('2026-08-03T10:00:00.000Z'),
      },
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as EventResponse[];

    expect(body).toHaveLength(2);
    expect(body.map((event) => event.id)).toEqual([
      newerEvent.id,
      olderEvent.id,
    ]);
    expect(body.map((event) => event.id)).not.toContain(anotherOwnersEvent.id);
    expect(body.every((event) => event.ownerId === owner.id)).toBe(true);
  });

  it('returns an owned event by id', async () => {
    const owner = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, owner.id);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Owned event',
        slug: 'owned-event',
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as EventResponse;

    expect(body.id).toBe(event.id);
    expect(body.ownerId).toBe(owner.id);
    expect(body.title).toBe(event.title);
  });

  it('does not expose another owner event by id', async () => {
    const owner = await createTestUser(prisma);
    const anotherUser = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, anotherUser.id);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Private owner event',
        slug: 'private-owner-event',
      },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('updates a draft and increments its version', async () => {
    const owner = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, owner.id);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Original title',
        slug: 'original-title',
      },
    });
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/events/${event.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Updated title',
        description: 'Updated description',
        capacity: 25,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timezone: 'Europe/Moscow',
        expectedVersion: 1,
      })
      .expect(200);

    const body = response.body as EventResponse;

    expect(body.title).toBe('Updated title');
    expect(body.description).toBe('Updated description');
    expect(body.capacity).toBe(25);
    expect(body.startsAt).toBe(startsAt.toISOString());
    expect(body.endsAt).toBe(endsAt.toISOString());
    expect(body.version).toBe(2);

    const updatedEvent = await prisma.event.findUniqueOrThrow({
      where: {
        id: event.id,
      },
    });

    expect(updatedEvent.title).toBe('Updated title');
    expect(updatedEvent.version).toBe(2);
  });

  it('returns 400 when the event end date is not later than its start date', async () => {
    const owner = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, owner.id);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Invalid dates event',
        slug: 'invalid-dates-event',
      },
    });
    const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() - 60 * 60 * 1000);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${event.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        expectedVersion: 1,
      })
      .expect(400);

    const unchangedEvent = await prisma.event.findUniqueOrThrow({
      where: {
        id: event.id,
      },
    });

    expect(unchangedEvent.startsAt).toBeNull();
    expect(unchangedEvent.endsAt).toBeNull();
    expect(unchangedEvent.version).toBe(1);
  });

  it('returns 409 when updating a draft with a stale version', async () => {
    const owner = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, owner.id);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Current title',
        slug: 'current-title',
        version: 2,
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${event.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Stale update',
        expectedVersion: 1,
      })
      .expect(409);

    const unchangedEvent = await prisma.event.findUniqueOrThrow({
      where: {
        id: event.id,
      },
    });

    expect(unchangedEvent.title).toBe('Current title');
    expect(unchangedEvent.version).toBe(2);
  });

  it('updates draft access settings and increments its version', async () => {
    const owner = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, owner.id);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Access settings event',
        slug: 'access-settings-event',
      },
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/events/${event.id}/access`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        visibility: EventVisibility.PUBLIC,
        participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
        expectedVersion: 1,
      })
      .expect(200);

    const body = response.body as EventResponse;

    expect(body.visibility).toBe(EventVisibility.PUBLIC);
    expect(body.participationPolicy).toBe(
      ParticipationPolicy.OPEN_REGISTRATION,
    );
    expect(body.version).toBe(2);
  });

  it('does not allow access settings of a published event to be changed', async () => {
    const owner = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, owner.id);
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Published event',
        slug: 'published-access-event',
        status: EventStatus.PUBLISHED,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
        publishedAt: new Date(),
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${event.id}/access`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        visibility: EventVisibility.PUBLIC,
        expectedVersion: 1,
      })
      .expect(409);
  });

  it('publishes a valid event draft', async () => {
    const owner = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, owner.id);
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Ready for publication',
        slug: 'ready-for-publication',
        startsAt,
        endsAt,
        visibility: EventVisibility.PUBLIC,
        participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expectedVersion: 1,
      })
      .expect(201);

    const body = response.body as EventResponse;

    expect(body.status).toBe(EventStatus.PUBLISHED);
    expect(body.publishedAt).toEqual(expect.any(String));
    expect(body.version).toBe(2);

    const publishedEvent = await prisma.event.findUniqueOrThrow({
      where: {
        id: event.id,
      },
    });

    expect(publishedEvent.status).toBe(EventStatus.PUBLISHED);
    expect(publishedEvent.publishedAt).not.toBeNull();
    expect(publishedEvent.version).toBe(2);
  });

  it('returns 400 when publishing a draft without dates', async () => {
    const owner = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, owner.id);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Incomplete draft',
        slug: 'incomplete-draft',
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expectedVersion: 1,
      })
      .expect(400);

    const unchangedEvent = await prisma.event.findUniqueOrThrow({
      where: {
        id: event.id,
      },
    });

    expect(unchangedEvent.status).toBe(EventStatus.DRAFT);
    expect(unchangedEvent.publishedAt).toBeNull();
    expect(unchangedEvent.version).toBe(1);
  });

  it('returns 409 when publishing a draft with a stale version', async () => {
    const owner = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, owner.id);
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Changed draft',
        slug: 'changed-draft',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
        version: 2,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expectedVersion: 1,
      })
      .expect(409);

    const unchangedEvent = await prisma.event.findUniqueOrThrow({
      where: {
        id: event.id,
      },
    });

    expect(unchangedEvent.status).toBe(EventStatus.DRAFT);
    expect(unchangedEvent.version).toBe(2);
  });

  it('filters and paginates the public event catalog', async () => {
    const owner = await createTestUser(prisma, {
      name: 'Public Organizer',
    });
    const firstStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const secondStart = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const firstPublicEvent = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Board Games Evening',
        slug: 'board-games-evening',
        status: EventStatus.PUBLISHED,
        visibility: EventVisibility.PUBLIC,
        participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
        startsAt: firstStart,
        endsAt: new Date(firstStart.getTime() + 2 * 60 * 60 * 1000),
        publishedAt: new Date(),
      },
    });
    const secondPublicEvent = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Video Games Tournament',
        slug: 'video-games-tournament',
        status: EventStatus.PUBLISHED,
        visibility: EventVisibility.PUBLIC,
        participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
        startsAt: secondStart,
        endsAt: new Date(secondStart.getTime() + 2 * 60 * 60 * 1000),
        publishedAt: new Date(),
      },
    });

    await prisma.event.createMany({
      data: [
        {
          ownerId: owner.id,
          title: 'Private Games',
          slug: 'private-games',
          status: EventStatus.PUBLISHED,
          visibility: EventVisibility.PRIVATE,
          participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
          startsAt: firstStart,
          endsAt: secondStart,
          publishedAt: new Date(),
        },
        {
          ownerId: owner.id,
          title: 'Draft Games',
          slug: 'draft-games',
          status: EventStatus.DRAFT,
          visibility: EventVisibility.PUBLIC,
          participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
          startsAt: firstStart,
          endsAt: secondStart,
        },
        {
          ownerId: owner.id,
          title: 'Past Games',
          slug: 'past-games',
          status: EventStatus.PUBLISHED,
          visibility: EventVisibility.PUBLIC,
          participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
          startsAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() - 46 * 60 * 60 * 1000),
          publishedAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
        },
      ],
    });

    const firstPageResponse = await request(app.getHttpServer())
      .get('/api/v1/public/events')
      .query({
        search: 'games',
        participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
        page: 1,
        limit: 1,
      })
      .expect(200);

    const firstPage = firstPageResponse.body as PublicEventsListResponse;

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]?.slug).toBe(firstPublicEvent.slug);
    expect(firstPage.items[0]?.owner.name).toBe('Public Organizer');
    expect(firstPage.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });

    const secondPageResponse = await request(app.getHttpServer())
      .get('/api/v1/public/events')
      .query({
        search: 'GAMES',
        participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
        page: 2,
        limit: 1,
      })
      .expect(200);

    const secondPage = secondPageResponse.body as PublicEventsListResponse;

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.slug).toBe(secondPublicEvent.slug);
    expect(secondPage.pagination.page).toBe(2);
  });

  it('returns a public event by slug without private fields', async () => {
    const owner = await createTestUser(prisma, {
      email: 'organizer@example.com',
      name: 'Organizer',
    });
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Public event page',
        slug: 'public-event-page',
        description: 'Public description',
        status: EventStatus.PUBLISHED,
        visibility: EventVisibility.PUBLIC,
        participationPolicy: ParticipationPolicy.APPROVAL_REQUIRED,
        capacity: 30,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000),
        publishedAt: new Date(),
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/public/events/${event.slug}`)
      .expect(200);

    const body = response.body as PublicEventResponse;

    expect(body.title).toBe(event.title);
    expect(body.slug).toBe(event.slug);
    expect(body.owner).toEqual({
      name: owner.name,
    });
    expect(body).not.toHaveProperty('ownerId');
    expect(body).not.toHaveProperty('version');
    expect(body).not.toHaveProperty('status');
    expect(body.owner).not.toHaveProperty('email');
  });

  it('returns an unlisted event by its direct link', async () => {
    const owner = await createTestUser(prisma);
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Unlisted event',
        slug: 'unlisted-event',
        status: EventStatus.PUBLISHED,
        visibility: EventVisibility.UNLISTED,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
        publishedAt: new Date(),
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/public/events/${event.slug}`)
      .expect(200);

    const body = response.body as PublicEventResponse;
    expect(body.slug).toBe(event.slug);
  });

  it('returns 404 for a private event through the public endpoint', async () => {
    const owner = await createTestUser(prisma);
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        title: 'Private event',
        slug: 'private-event',
        status: EventStatus.PUBLISHED,
        visibility: EventVisibility.PRIVATE,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
        publishedAt: new Date(),
      },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/public/events/${event.slug}`)
      .expect(404);
  });

  it('validates event creation data', async () => {
    const owner = await createTestUser(prisma);
    const accessToken = await createAccessToken(app, owner.id);

    await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'ab',
        unexpectedField: true,
      })
      .expect(400);

    expect(await prisma.event.count()).toBe(0);
  });
});
