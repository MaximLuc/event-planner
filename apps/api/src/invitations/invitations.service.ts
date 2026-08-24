import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateInvitationDto } from './dto/create-invitation.dto/create-invitation.dto';
import {
  EventStatus,
  InvitationStatus,
  ParticipationPolicy,
  RegistrationStatus,
} from '../generated/prisma/enums';

@Injectable()
export class InvitationsService {
  constructor(private readonly prismaService: PrismaService) {}

  async invite(userId: string, eventId: string, dto: CreateInvitationDto) {
    const event = await this.prismaService.event.findUnique({
      where: {
        ownerId: userId,
        id: eventId,
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
      event.participationPolicy !== ParticipationPolicy.INVITE_ONLY
    ) {
      throw new NotFoundException('Event is not available');
    }

    if (!event.startsAt || event.startsAt <= new Date()) {
      throw new ConflictException('Registration for this event is closed');
    }

    const invitedUser = await this.prismaService.user.findUnique({
      where: {
        email: dto.email.trim().toLowerCase(),
      },
      select: {
        id: true,
      },
    });

    if (!invitedUser) {
      throw new NotFoundException('Invited user not found');
    }

    if (event.ownerId === invitedUser.id) {
      throw new ForbiddenException('Event owner cannot invite themselves');
    }

    const checkInvites = await this.prismaService.eventRegistration.findFirst({
      where: {
        userId: invitedUser.id,
        eventId,
        status: {
          in: [RegistrationStatus.PENDING, RegistrationStatus.APPROVED],
        },
      },
    });

    if (checkInvites) {
      throw new ConflictException('User already register');
    }

    const existingInvitation =
      await this.prismaService.eventInvitation.findUnique({
        where: {
          eventId_invitedUserId: {
            eventId: event.id,
            invitedUserId: invitedUser.id,
          },
        },
      });

    if (existingInvitation) {
      if (
        existingInvitation.status === InvitationStatus.PENDING ||
        existingInvitation.status === InvitationStatus.ACCEPTED
      ) {
        throw new ConflictException('Invitation already exists');
      }
      return this.prismaService.eventInvitation.update({
        where: {
          id: existingInvitation.id,
        },
        data: {
          status: InvitationStatus.PENDING,
          respondedAt: null,
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,

          invitedUser: {
            select: {
              name: true,
              email: true,
            },
          },

          event: {
            select: {
              title: true,
              slug: true,
            },
          },
        },
      });
    }
    return this.prismaService.eventInvitation.create({
      data: {
        eventId: event.id,
        invitedUserId: invitedUser.id,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        invitedUser: {
          select: {
            name: true,
            email: true,
          },
        },

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
