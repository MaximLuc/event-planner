/// <reference types="jest" />

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import {
  InvitationStatus,
  RegistrationStatus,
} from '../src/generated/prisma/enums';
import { createTestApp } from './helpers/create-test-app';
import { cleanDatabase } from './helpers/database.helper';
import { createAccessToken } from './helpers/auth.helper';
import {
  createPendingInvitation,
  createPublishedInviteOnlyEvent,
  createTestUser,
} from './helpers/factories';

describe('Invitations (e2e)', () => {
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

  it('allows an event owner to invite a registered user', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);

    const accessToken = await createAccessToken(app, owner.id);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: invitedUser.email,
      })
      .expect(201);

    const invitation = await prisma.eventInvitation.findUnique({
      where: {
        eventId_invitedUserId: {
          eventId: event.id,
          invitedUserId: invitedUser.id,
        },
      },
    });
    expect(invitation).not.toBeNull();
    expect(invitation?.status).toBe(InvitationStatus.PENDING);
    expect(invitation?.respondedAt).toBeNull();
  });

  it('accepts an invitation and creates an approved registration', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);

    const invitation = await createPendingInvitation(
      prisma,
      event.id,
      invitedUser.id,
    );

    const accessToken = await createAccessToken(app, invitedUser.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/invitations/${invitation.id}/respond`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        accepted: true,
      })
      .expect(200);

    const [updatedInvitation, registration] = await Promise.all([
      prisma.eventInvitation.findUnique({
        where: {
          id: invitation.id,
        },
      }),

      prisma.eventRegistration.findUnique({
        where: {
          eventId_userId: {
            eventId: event.id,
            userId: invitedUser.id,
          },
        },
      }),
    ]);
    expect(updatedInvitation).not.toBeNull();
    expect(updatedInvitation?.status).toBe(InvitationStatus.ACCEPTED);
    expect(updatedInvitation?.respondedAt).toBeInstanceOf(Date);

    expect(registration).not.toBeNull();
    expect(registration?.status).toBe(RegistrationStatus.APPROVED);
  });

  it('allows the event owner to revoke a pending invitation', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);

    const invitation = await createPendingInvitation(
      prisma,
      event.id,
      invitedUser.id,
    );

    const accessToken = await createAccessToken(app, owner.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${event.id}/invitations/${invitation.id}/revoke`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const updatedInvitation = await prisma.eventInvitation.findUnique({
      where: {
        id: invitation.id,
      },
    });

    expect(updatedInvitation).not.toBeNull();
    expect(updatedInvitation?.status).toBe(InvitationStatus.REVOKED);
    expect(updatedInvitation?.respondedAt).toBeNull();
  });

  it('returns 401 when access token is missing', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/invitations`)
      .send({
        email: invitedUser.email,
      })
      .expect(401);

    const invitation = await prisma.eventInvitation.findUnique({
      where: {
        eventId_invitedUserId: {
          eventId: event.id,
          invitedUserId: invitedUser.id,
        },
      },
    });

    expect(invitation).toBeNull();
  });

  it('does not allow another user to invite people to an event', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });

    const otherUser = await createTestUser(prisma, {
      email: 'other@example.com',
      name: 'Other',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);

    const accessToken = await createAccessToken(app, otherUser.id);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: invitedUser.email,
      })
      .expect(404);

    const invitation = await prisma.eventInvitation.findUnique({
      where: {
        eventId_invitedUserId: {
          eventId: event.id,
          invitedUserId: invitedUser.id,
        },
      },
    });

    expect(invitation).toBeNull();
  });
});
