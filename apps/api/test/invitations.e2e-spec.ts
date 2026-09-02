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
  createTestInvitation,
  createPublishedInviteOnlyEvent,
  createTestUser,
} from './helpers/factories';

type InvitationsListResponse = {
  items: Array<{
    id: string;
    status: InvitationStatus;
    createdAt: string;
    updatedAt: string;
    respondedAt: string | null;
    invitedUser: {
      name: string;
      email: string;
    };
  }>;

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

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

    const invitation = await createTestInvitation(
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

    const invitation = await createTestInvitation(
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

  it('allows a declined invitation to be sent again', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);

    const invitation = await createTestInvitation(
      prisma,
      event.id,
      invitedUser.id,
    );

    const ownerAccessToken = await createAccessToken(app, owner.id);
    const invitedUserAccessToken = await createAccessToken(app, invitedUser.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/invitations/${invitation.id}/respond`)
      .set('Authorization', `Bearer ${invitedUserAccessToken}`)
      .send({
        accepted: false,
      })
      .expect(200);

    const declereInvitation = await prisma.eventInvitation.findUnique({
      where: {
        id: invitation.id,
      },
    });

    expect(declereInvitation?.status).toBe(InvitationStatus.DECLINED);
    expect(declereInvitation?.respondedAt).toBeInstanceOf(Date);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/invitations`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        email: invitedUser.email,
      })
      .expect(201);

    const newInvitation = await prisma.eventInvitation.findUnique({
      where: {
        eventId_invitedUserId: {
          eventId: event.id,
          invitedUserId: invitedUser.id,
        },
      },
    });

    expect(newInvitation?.id).toBe(invitation.id);
    expect(newInvitation?.status).toBe(InvitationStatus.PENDING);
    expect(newInvitation?.respondedAt).toBeNull();

    const invitationsCount = await prisma.eventInvitation.count({
      where: {
        eventId: event.id,
        invitedUserId: invitedUser.id,
      },
    });

    expect(invitationsCount).toBe(1);
  });

  it('returns 409 when an invitation has already been accepted', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);

    const invitation = await createTestInvitation(
      prisma,
      event.id,
      invitedUser.id,
    );

    const invitedUserAccessToken = await createAccessToken(app, invitedUser.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/invitations/${invitation.id}/respond`)
      .set('Authorization', `Bearer ${invitedUserAccessToken}`)
      .send({
        accepted: true,
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/invitations/${invitation.id}/respond`)
      .set('Authorization', `Bearer ${invitedUserAccessToken}`)
      .send({
        accepted: true,
      })
      .expect(409);

    const acceptedInvitation = await prisma.eventInvitation.findUnique({
      where: {
        id: invitation.id,
      },
    });
    expect(acceptedInvitation).not.toBeNull();
    expect(acceptedInvitation?.status).toBe(InvitationStatus.ACCEPTED);

    const registrationsCount = await prisma.eventRegistration.count({
      where: {
        eventId: event.id,
        userId: invitedUser.id,
      },
    });

    expect(registrationsCount).toBe(1);
    const registrations = await prisma.eventRegistration.findFirst({
      where: {
        eventId: event.id,
        userId: invitedUser.id,
      },
    });
    expect(registrations).not.toBeNull();
    expect(registrations?.status).toBe(RegistrationStatus.APPROVED);
  });

  it('returns 409 when event capacity is full', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });

    const lastUser = await createTestUser(prisma, {
      email: 'last_participant@example.com',
      name: 'Last_Participant',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id, {
      capacity: 1,
    });

    const invitation = await createTestInvitation(
      prisma,
      event.id,
      invitedUser.id,
    );

    const invitedUserAccessToken = await createAccessToken(app, invitedUser.id);

    await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: lastUser.id,
        status: RegistrationStatus.APPROVED,
      },
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/invitations/${invitation.id}/respond`)
      .set('Authorization', `Bearer ${invitedUserAccessToken}`)
      .send({
        accepted: true,
      })
      .expect(409);

    const acceptedInvitation = await prisma.eventInvitation.findUnique({
      where: {
        id: invitation.id,
      },
    });

    expect(acceptedInvitation?.status).toBe(InvitationStatus.PENDING);
    expect(acceptedInvitation?.respondedAt).toBeNull();

    const registrationsCount = await prisma.eventRegistration.count({
      where: {
        eventId: event.id,
        userId: invitedUser.id,
      },
    });

    expect(registrationsCount).toBe(0);

    const approvedRegistrationsCount = await prisma.eventRegistration.count({
      where: {
        eventId: event.id,
        status: RegistrationStatus.APPROVED,
      },
    });
    expect(approvedRegistrationsCount).toBe(1);
  });

  it('does not allow a revoked invitation to be accepted', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);

    const invitation = await createTestInvitation(
      prisma,
      event.id,
      invitedUser.id,
    );

    const invitedUserAccessToken = await createAccessToken(app, invitedUser.id);
    const ownerAccessToken = await createAccessToken(app, owner.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${event.id}/invitations/${invitation.id}/revoke`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/invitations/${invitation.id}/respond`)
      .set('Authorization', `Bearer ${invitedUserAccessToken}`)
      .send({
        accepted: true,
      })
      .expect(409);

    const updatedInvitation = await prisma.eventInvitation.findUnique({
      where: {
        eventId_invitedUserId: {
          eventId: event.id,
          invitedUserId: invitedUser.id,
        },
      },
    });

    expect(updatedInvitation).not.toBeNull();
    expect(updatedInvitation?.status).toBe(InvitationStatus.REVOKED);
    expect(updatedInvitation?.respondedAt).toBeNull();

    const registrations = await prisma.eventRegistration.count({
      where: {
        eventId: event.id,
      },
    });
    expect(registrations).toBe(0);
  });

  it('does not allow an accepted invitation to be revoked', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser = await createTestUser(prisma, {
      email: 'participant@example.com',
      name: 'Participant',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);

    const invitation = await createTestInvitation(
      prisma,
      event.id,
      invitedUser.id,
    );

    const invitedUserAccessToken = await createAccessToken(app, invitedUser.id);
    const ownerAccessToken = await createAccessToken(app, owner.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/invitations/${invitation.id}/respond`)
      .set('Authorization', `Bearer ${invitedUserAccessToken}`)
      .send({
        accepted: true,
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${event.id}/invitations/${invitation.id}/revoke`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(409);

    const updatedInvitation = await prisma.eventInvitation.findUnique({
      where: {
        eventId_invitedUserId: {
          eventId: event.id,
          invitedUserId: invitedUser.id,
        },
      },
    });

    expect(updatedInvitation?.status).toBe(InvitationStatus.ACCEPTED);
    expect(updatedInvitation?.respondedAt).toBeInstanceOf(Date);

    const registrations = await prisma.eventRegistration.count({
      where: {
        status: RegistrationStatus.APPROVED,
      },
    });

    expect(registrations).toBe(1);
  });

  it('filters event invitations by status', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser1 = await createTestUser(prisma, {
      email: 'participant1@example.com',
      name: 'Participant1',
    });

    const invitedUser2 = await createTestUser(prisma, {
      email: 'participant2@example.com',
      name: 'Participant2',
    });

    const invitedUser3 = await createTestUser(prisma, {
      email: 'participant3@example.com',
      name: 'Participant3',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);
    const ownerAccessToken = await createAccessToken(app, owner.id);
    await prisma.eventInvitation.createMany({
      data: [
        {
          eventId: event.id,
          invitedUserId: invitedUser1.id,
          status: InvitationStatus.PENDING,
        },
        {
          eventId: event.id,
          invitedUserId: invitedUser2.id,
          status: InvitationStatus.DECLINED,
          respondedAt: new Date(),
        },
        {
          eventId: event.id,
          invitedUserId: invitedUser3.id,
          status: InvitationStatus.REVOKED,
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/invitations`)
      .query({
        status: InvitationStatus.PENDING,
        page: 1,
        limit: 10,
      })
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);

    const body = response.body as InvitationsListResponse;

    expect(body.items).toHaveLength(1);

    expect(body.items[0]?.status).toBe(InvitationStatus.PENDING);
    expect(body.items[0]?.invitedUser.email).toBe(invitedUser1.email);

    expect(body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('paginates event invitations', async () => {
    const owner = await createTestUser(prisma, {
      email: 'owner@example.com',
      name: 'Event Owner',
    });

    const invitedUser1 = await createTestUser(prisma, {
      email: 'participant1@example.com',
      name: 'Participant1',
    });

    const invitedUser2 = await createTestUser(prisma, {
      email: 'participant2@example.com',
      name: 'Participant2',
    });

    const invitedUser3 = await createTestUser(prisma, {
      email: 'participant3@example.com',
      name: 'Participant3',
    });

    const event = await createPublishedInviteOnlyEvent(prisma, owner.id);
    const ownerAccessToken = await createAccessToken(app, owner.id);
    await prisma.eventInvitation.createMany({
      data: [
        {
          eventId: event.id,
          invitedUserId: invitedUser1.id,
          status: InvitationStatus.PENDING,
        },
        {
          eventId: event.id,
          invitedUserId: invitedUser2.id,
          status: InvitationStatus.DECLINED,
          respondedAt: new Date(),
        },
        {
          eventId: event.id,
          invitedUserId: invitedUser3.id,
          status: InvitationStatus.REVOKED,
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/invitations`)
      .query({
        page: 2,
        limit: 2,
      })
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);

    const body = response.body as InvitationsListResponse;

    expect(body.items).toHaveLength(1);

    expect(body.pagination).toEqual({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
  });
});
