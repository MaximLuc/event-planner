/// <reference types="jest" />

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import {
  EventStatus,
  EventVisibility,
  ParticipationPolicy,
  RegistrationStatus,
} from '../src/generated/prisma/enums';
import { createAccessToken } from './helpers/auth.helper';
import { createTestApp } from './helpers/create-test-app';
import { cleanDatabase } from './helpers/database.helper';
import { createTestUser } from './helpers/factories';

type CreatePublishedEventOptions = {
  title?: string;
  visibility?: EventVisibility;
  participationPolicy?: ParticipationPolicy;
  capacity?: number | null;
  startsAt?: Date;
};

function createPublishedEvent(
  prisma: PrismaService,
  ownerId: string,
  options: CreatePublishedEventOptions = {},
) {
  const startsAt =
    options.startsAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);

  return prisma.event.create({
    data: {
      ownerId,
      title: options.title ?? 'Published event',
      slug: `published-event-${randomUUID()}`,
      status: EventStatus.PUBLISHED,
      visibility: options.visibility ?? EventVisibility.PUBLIC,
      participationPolicy:
        options.participationPolicy ?? ParticipationPolicy.OPEN_REGISTRATION,
      capacity: options.capacity === undefined ? 10 : options.capacity,
      startsAt,
      endsAt,
      publishedAt: new Date(),
    },
  });
}

type RegistrationResponse = {
  id: string;
  status: RegistrationStatus;
  createdAt: string;
  event: {
    title: string;
    slug: string;
  };
};

type OwnerRegistrationResponse = {
  id: string;
  status: RegistrationStatus;
  createdAt: string;
  updatedAt: string;
  user: {
    name: string;
    email: string;
  };
};

type RegistrationsListResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type MyRegistrationResponse = {
  id: string;
  status: RegistrationStatus;
  createdAt: string;
  event: {
    title: string;
    slug: string;
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
    status: EventStatus;
    owner: {
      name: string;
    };
  };
};

describe('Registrations (e2e)', () => {
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

  it('immediately approves an open registration', async () => {
    const owner = await createTestUser(prisma, { name: 'Owner' });
    const participant = await createTestUser(prisma, {
      name: 'Participant',
    });
    const event = await createPublishedEvent(prisma, owner.id, {
      participationPolicy: ParticipationPolicy.OPEN_REGISTRATION,
    });
    const accessToken = await createAccessToken(app, participant.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.slug}/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const body = response.body as RegistrationResponse;

    expect(body.status).toBe(RegistrationStatus.APPROVED);
    expect(body.event).toEqual({
      title: event.title,
      slug: event.slug,
    });
    expect(body).not.toHaveProperty('user');

    const registration = await prisma.eventRegistration.findUnique({
      where: {
        eventId_userId: {
          eventId: event.id,
          userId: participant.id,
        },
      },
    });

    expect(registration?.status).toBe(RegistrationStatus.APPROVED);
  });

  it('creates a pending registration when approval is required', async () => {
    const owner = await createTestUser(prisma);
    const participant = await createTestUser(prisma);
    const event = await createPublishedEvent(prisma, owner.id, {
      participationPolicy: ParticipationPolicy.APPROVAL_REQUIRED,
    });
    const accessToken = await createAccessToken(app, participant.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.slug}/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const body = response.body as RegistrationResponse;
    expect(body.status).toBe(RegistrationStatus.PENDING);
  });

  it('returns 403 when registration is available by invitation only', async () => {
    const owner = await createTestUser(prisma);
    const participant = await createTestUser(prisma);
    const event = await createPublishedEvent(prisma, owner.id, {
      participationPolicy: ParticipationPolicy.INVITE_ONLY,
    });
    const accessToken = await createAccessToken(app, participant.id);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.slug}/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(await prisma.eventRegistration.count()).toBe(0);
  });

  it('does not allow the event owner to register as a participant', async () => {
    const owner = await createTestUser(prisma);
    const event = await createPublishedEvent(prisma, owner.id);
    const accessToken = await createAccessToken(app, owner.id);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.slug}/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(await prisma.eventRegistration.count()).toBe(0);
  });

  it('returns 409 when the user is already registered', async () => {
    const owner = await createTestUser(prisma);
    const participant = await createTestUser(prisma);
    const event = await createPublishedEvent(prisma, owner.id);
    const accessToken = await createAccessToken(app, participant.id);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.slug}/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.slug}/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);

    const registrationsCount = await prisma.eventRegistration.count({
      where: {
        eventId: event.id,
        userId: participant.id,
      },
    });

    expect(registrationsCount).toBe(1);
  });

  it('returns 409 without creating a registration when capacity is full', async () => {
    const owner = await createTestUser(prisma);
    const registeredUser = await createTestUser(prisma);
    const participant = await createTestUser(prisma);
    const event = await createPublishedEvent(prisma, owner.id, {
      capacity: 1,
    });
    await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: registeredUser.id,
        status: RegistrationStatus.APPROVED,
      },
    });
    const accessToken = await createAccessToken(app, participant.id);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.slug}/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);

    const participantRegistration = await prisma.eventRegistration.findUnique({
      where: {
        eventId_userId: {
          eventId: event.id,
          userId: participant.id,
        },
      },
    });

    expect(participantRegistration).toBeNull();
    expect(
      await prisma.eventRegistration.count({
        where: {
          eventId: event.id,
          status: RegistrationStatus.APPROVED,
        },
      }),
    ).toBe(1);
  });

  it('cancels the current user active registration', async () => {
    const owner = await createTestUser(prisma);
    const participant = await createTestUser(prisma);
    const event = await createPublishedEvent(prisma, owner.id);
    const registration = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: participant.id,
        status: RegistrationStatus.APPROVED,
      },
    });
    const accessToken = await createAccessToken(app, participant.id);

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/events/${event.slug}/registrations/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      status: RegistrationStatus.CANCELLED,
    });

    const cancelledRegistration =
      await prisma.eventRegistration.findUniqueOrThrow({
        where: {
          id: registration.id,
        },
      });

    expect(cancelledRegistration.status).toBe(RegistrationStatus.CANCELLED);

    await request(app.getHttpServer())
      .delete(`/api/v1/events/${event.slug}/registrations/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('allows the owner to approve a pending registration', async () => {
    const owner = await createTestUser(prisma);
    const participant = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });
    const event = await createPublishedEvent(prisma, owner.id, {
      participationPolicy: ParticipationPolicy.APPROVAL_REQUIRED,
    });
    const registration = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: participant.id,
        status: RegistrationStatus.PENDING,
      },
    });
    const accessToken = await createAccessToken(app, owner.id);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/events/${event.id}/registrations/${registration.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: RegistrationStatus.APPROVED,
      })
      .expect(200);

    const body = response.body as OwnerRegistrationResponse;

    expect(body.status).toBe(RegistrationStatus.APPROVED);
    expect(body.user).toEqual({
      name: participant.name,
      email: participant.email,
    });

    const approvedRegistration =
      await prisma.eventRegistration.findUniqueOrThrow({
        where: {
          id: registration.id,
        },
      });

    expect(approvedRegistration.status).toBe(RegistrationStatus.APPROVED);
  });

  it('allows the owner to reject a pending registration', async () => {
    const owner = await createTestUser(prisma);
    const participant = await createTestUser(prisma);
    const event = await createPublishedEvent(prisma, owner.id, {
      participationPolicy: ParticipationPolicy.APPROVAL_REQUIRED,
    });
    const registration = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: participant.id,
        status: RegistrationStatus.PENDING,
      },
    });
    const accessToken = await createAccessToken(app, owner.id);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/events/${event.id}/registrations/${registration.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: RegistrationStatus.REJECTED,
      })
      .expect(200);

    const body = response.body as OwnerRegistrationResponse;
    expect(body.status).toBe(RegistrationStatus.REJECTED);
  });

  it('keeps a pending registration unchanged when approval capacity is full', async () => {
    const owner = await createTestUser(prisma);
    const approvedUser = await createTestUser(prisma);
    const pendingUser = await createTestUser(prisma);
    const event = await createPublishedEvent(prisma, owner.id, {
      participationPolicy: ParticipationPolicy.APPROVAL_REQUIRED,
      capacity: 1,
    });
    await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: approvedUser.id,
        status: RegistrationStatus.APPROVED,
      },
    });
    const pendingRegistration = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: pendingUser.id,
        status: RegistrationStatus.PENDING,
      },
    });
    const accessToken = await createAccessToken(app, owner.id);

    await request(app.getHttpServer())
      .patch(
        `/api/v1/events/${event.id}/registrations/${pendingRegistration.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: RegistrationStatus.APPROVED,
      })
      .expect(409);

    const unchangedRegistration =
      await prisma.eventRegistration.findUniqueOrThrow({
        where: {
          id: pendingRegistration.id,
        },
      });

    expect(unchangedRegistration.status).toBe(RegistrationStatus.PENDING);
  });

  it('filters and paginates registrations for an owned event', async () => {
    const owner = await createTestUser(prisma);
    const firstParticipant = await createTestUser(prisma, {
      email: 'first@example.com',
      name: 'First participant',
    });
    const secondParticipant = await createTestUser(prisma, {
      email: 'second@example.com',
      name: 'Second participant',
    });
    const approvedParticipant = await createTestUser(prisma);
    const event = await createPublishedEvent(prisma, owner.id);
    const olderPendingRegistration = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: firstParticipant.id,
        status: RegistrationStatus.PENDING,
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
      },
    });
    const newerPendingRegistration = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: secondParticipant.id,
        status: RegistrationStatus.PENDING,
        createdAt: new Date('2026-08-02T10:00:00.000Z'),
      },
    });
    await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: approvedParticipant.id,
        status: RegistrationStatus.APPROVED,
      },
    });
    const accessToken = await createAccessToken(app, owner.id);

    const firstPageResponse = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({
        status: RegistrationStatus.PENDING,
        page: 1,
        limit: 1,
      })
      .expect(200);

    const firstPage =
      firstPageResponse.body as RegistrationsListResponse<OwnerRegistrationResponse>;

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]?.id).toBe(newerPendingRegistration.id);
    expect(firstPage.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });

    const secondPageResponse = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({
        status: RegistrationStatus.PENDING,
        page: 2,
        limit: 1,
      })
      .expect(200);

    const secondPage =
      secondPageResponse.body as RegistrationsListResponse<OwnerRegistrationResponse>;

    expect(secondPage.items[0]?.id).toBe(olderPendingRegistration.id);
  });

  it('returns 404 when another user requests event registrations', async () => {
    const owner = await createTestUser(prisma);
    const anotherUser = await createTestUser(prisma);
    const event = await createPublishedEvent(prisma, owner.id);
    const accessToken = await createAccessToken(app, anotherUser.id);

    await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/registrations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('returns filtered and paginated registrations of the current user', async () => {
    const owner = await createTestUser(prisma, { name: 'Organizer' });
    const participant = await createTestUser(prisma);
    const anotherParticipant = await createTestUser(prisma);
    const firstStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const secondStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const firstEvent = await createPublishedEvent(prisma, owner.id, {
      title: 'First event',
      startsAt: firstStart,
    });
    const secondEvent = await createPublishedEvent(prisma, owner.id, {
      title: 'Second event',
      startsAt: secondStart,
    });
    const rejectedEvent = await createPublishedEvent(prisma, owner.id, {
      title: 'Rejected event',
    });
    await prisma.eventRegistration.createMany({
      data: [
        {
          eventId: firstEvent.id,
          userId: participant.id,
          status: RegistrationStatus.APPROVED,
        },
        {
          eventId: secondEvent.id,
          userId: participant.id,
          status: RegistrationStatus.APPROVED,
        },
        {
          eventId: rejectedEvent.id,
          userId: participant.id,
          status: RegistrationStatus.REJECTED,
        },
        {
          eventId: rejectedEvent.id,
          userId: anotherParticipant.id,
          status: RegistrationStatus.APPROVED,
        },
      ],
    });
    const accessToken = await createAccessToken(app, participant.id);

    const response = await request(app.getHttpServer())
      .get('/api/v1/registrations/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({
        status: RegistrationStatus.APPROVED,
        page: 1,
        limit: 1,
      })
      .expect(200);

    const body =
      response.body as RegistrationsListResponse<MyRegistrationResponse>;

    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.event.slug).toBe(firstEvent.slug);
    expect(body.items[0]?.event.owner).toEqual({
      name: owner.name,
    });
    expect(body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
  });
});
