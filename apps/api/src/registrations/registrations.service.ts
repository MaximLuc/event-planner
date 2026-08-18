import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import {
  EventStatus,
  EventVisibility,
  ParticipationPolicy,
  RegistrationStatus,
} from '../generated/prisma/enums';

@Injectable()
export class RegistrationsService {
  constructor(private readonly prismaService: PrismaService) {}

  async register(userId: string, slug: string) {
    const event = await this.prismaService.event.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
        ownerId: true,
        status: true,
        visibility: true,
        participationPolicy: true,
        capacity: true,
        startsAt: true,
      },
    });

    if (
      !event ||
      event.status !== EventStatus.PUBLISHED ||
      event.visibility === EventVisibility.PRIVATE
    ) {
      throw new NotFoundException('Event is not available');
    }

    if (!event.startsAt || event.startsAt <= new Date()) {
      throw new ConflictException('Registration for this event is closed');
    }

    if (event.ownerId === userId) {
      throw new ForbiddenException(
        'Event owner cannot register as a participant',
      );
    }

    if (event.participationPolicy === ParticipationPolicy.INVITE_ONLY) {
      throw new ForbiddenException(
        'Registration is available by invitation only',
      );
    }

    const existingRegistration =
      await this.prismaService.eventRegistration.findUnique({
        where: {
          eventId_userId: {
            eventId: event.id,
            userId,
          },
        },
      });

    if (existingRegistration) {
      throw new ConflictException('You are already registered for this event');
    }

    const registrationStatus =
      event.participationPolicy === ParticipationPolicy.OPEN_REGISTRATION
        ? RegistrationStatus.APPROVED
        : RegistrationStatus.PENDING;

    if (
      registrationStatus === RegistrationStatus.APPROVED &&
      event.capacity !== null
    ) {
      const approvedCount = await this.prismaService.eventRegistration.count({
        where: {
          eventId: event.id,
          status: RegistrationStatus.APPROVED,
        },
      });

      if (approvedCount >= event.capacity) {
        throw new ConflictException('No available places');
      }
    }

    return this.prismaService.eventRegistration.create({
      data: {
        eventId: event.id,
        userId,
        status: registrationStatus,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,

        event: {
          select: {
            title: true,
            slug: true,
          },
        },
      },
    });
  }
}
