import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  EventStatus,
  EventVisibility,
  InvitationStatus,
  ParticipationPolicy,
  SystemRole,
} from '../../src/generated/prisma/enums';

type CreateTestUserOptions = {
  email?: string;
  name?: string;
};

export function createTestUser(
  prisma: PrismaService,
  options: CreateTestUserOptions = {},
) {
  const suffix = randomUUID();

  return prisma.user.create({
    data: {
      email: options.email ?? `user-${suffix}@example.com`,
      name: options.name ?? 'Test User',
      passwordHash: 'password-is-not-used-in-this-test',
      systemRole: SystemRole.USER,
    },
  });
}

type CreateTestEventOptions = {
  title?: string;
  capacity?: number | null;
};

export function createPublishedInviteOnlyEvent(
  prisma: PrismaService,
  ownerId: string,
  options: CreateTestEventOptions = {},
) {
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);

  return prisma.event.create({
    data: {
      ownerId,
      title: options.title ?? 'Test event',
      slug: `test-event-${randomUUID()}`,
      status: EventStatus.PUBLISHED,
      visibility: EventVisibility.PRIVATE,
      participationPolicy: ParticipationPolicy.INVITE_ONLY,
      capacity: options.capacity ?? 10,
      startsAt,
      endsAt,
      publishedAt: new Date(),
    },
  });
}

export function createTestInvitation(
  prisma: PrismaService,
  eventId: string,
  invitedUserId: string,
  status: InvitationStatus = InvitationStatus.PENDING,
) {
  return prisma.eventInvitation.create({
    data: {
      eventId,
      invitedUserId,
      status: status,
    },
  });
}
