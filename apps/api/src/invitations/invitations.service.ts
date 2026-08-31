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
import { RespondInvitationDto } from './dto/respond-invitation.dto/respond-invitation.dto';
import { Prisma } from '../generated/prisma/client';
import { EventInvitationsQueryDto } from './dto/event-invitations-query.dto/event-invitations-query.dto';

const MAX_TRANSACTION_RETRIES = 3;

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
  async myInvitation(userId: string) {
    return this.prismaService.eventInvitation.findMany({
      where: {
        invitedUserId: userId,
        status: InvitationStatus.PENDING,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        event: {
          select: {
            title: true,
            slug: true,
            description: true,
            startsAt: true,
            endsAt: true,
            timezone: true,
            owner: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async respondInvitation(
    userId: string,
    invitationId: string,
    dto: RespondInvitationDto,
  ) {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
      try {
        return await this.prismaService.$transaction(
          async (transaction) => {
            const invitation = await transaction.eventInvitation.findUnique({
              where: {
                id: invitationId,
                invitedUserId: userId,
              },
              select: {
                id: true,
                status: true,
                event: {
                  select: {
                    id: true,
                    status: true,
                    startsAt: true,
                    capacity: true,
                  },
                },
              },
            });

            if (!invitation) {
              throw new NotFoundException('invitation not found');
            }

            if (invitation.status !== InvitationStatus.PENDING) {
              throw new ConflictException('invitation is already processed');
            }

            if (invitation.event.status !== EventStatus.PUBLISHED) {
              throw new ConflictException('Event is not published');
            }

            if (
              !invitation.event.startsAt ||
              invitation.event.startsAt <= new Date()
            ) {
              throw new ConflictException('Event has already started');
            }

            const respondedAt = new Date();

            if (!dto.accepted) {
              const declineResult =
                await transaction.eventInvitation.updateMany({
                  where: {
                    id: invitation.id,
                    invitedUserId: userId,
                    status: InvitationStatus.PENDING,
                  },
                  data: {
                    status: InvitationStatus.DECLINED,
                    respondedAt,
                  },
                });

              if (declineResult.count === 0) {
                throw new ConflictException(
                  'Invitation has already been processed',
                );
              }

              return transaction.eventInvitation.findUniqueOrThrow({
                where: { id: invitation.id },
                select: {
                  id: true,
                  status: true,
                  respondedAt: true,
                  event: {
                    select: {
                      title: true,
                      slug: true,
                    },
                  },
                },
              });
            }

            const existingRegistration =
              await transaction.eventRegistration.findUnique({
                where: {
                  eventId_userId: {
                    eventId: invitation.event.id,
                    userId,
                  },
                },
              });

            if (
              existingRegistration?.status === RegistrationStatus.PENDING ||
              existingRegistration?.status === RegistrationStatus.APPROVED
            ) {
              throw new ConflictException(
                'You already have an active registration',
              );
            }

            if (invitation.event.capacity !== null) {
              const approvedCount = await transaction.eventRegistration.count({
                where: {
                  eventId: invitation.event.id,
                  status: RegistrationStatus.APPROVED,
                },
              });

              if (approvedCount >= invitation.event.capacity) {
                throw new ConflictException('No seats available');
              }
            }

            if (existingRegistration) {
              await transaction.eventRegistration.update({
                where: { id: existingRegistration.id },
                data: { status: RegistrationStatus.APPROVED },
              });
            } else {
              await transaction.eventRegistration.create({
                data: {
                  eventId: invitation.event.id,
                  userId,
                  status: RegistrationStatus.APPROVED,
                },
              });
            }

            const acceptResult = await transaction.eventInvitation.updateMany({
              where: {
                id: invitation.id,
                invitedUserId: userId,
                status: InvitationStatus.PENDING,
              },
              data: {
                status: InvitationStatus.ACCEPTED,
                respondedAt,
              },
            });

            if (acceptResult.count === 0) {
              throw new ConflictException(
                'Invitation has already been processed',
              );
            }

            return transaction.eventInvitation.findUniqueOrThrow({
              where: { id: invitation.id },
              select: {
                id: true,
                status: true,
                respondedAt: true,
                event: {
                  select: {
                    title: true,
                    slug: true,
                  },
                },
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            throw new ConflictException(
              'You already have a registration for this event',
            );
          }

          if (error.code === 'P2034') {
            if (attempt < MAX_TRANSACTION_RETRIES) {
              continue;
            }

            throw new ConflictException(
              'Invitation processing conflict. Please try again',
            );
          }
        }

        throw error;
      }
    }

    throw new ConflictException('Invitation could not be processed');
  }

  async findEventInvitations(
    ownerId: string,
    eventId: string,
    query: EventInvitationsQueryDto,
  ) {
    const event = await this.prismaService.event.findUnique({
      where: {
        id: eventId,
        ownerId: ownerId,
      },
      select: {
        id: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Not found event');
    }

    const where: Prisma.EventInvitationWhereInput = {
      eventId,
      ...(query.status && {
        status: query.status,
      }),
    };
    const skip = (query.page - 1) * query.limit;
    const take = query.limit;

    const [items, total] = await this.prismaService.$transaction([
      this.prismaService.eventInvitation.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          respondedAt: true,
          invitedUser: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prismaService.eventInvitation.count({
        where,
      }),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async revoke(ownerId: string, eventId: string, invitationId: string) {
    const event = await this.prismaService.event.findUnique({
      where: {
        id: eventId,
        ownerId: ownerId,
      },
      select: {
        id: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Not found event');
    }

    const existingInvitation =
      await this.prismaService.eventInvitation.findFirst({
        where: {
          id: invitationId,
          eventId: eventId,
        },
      });

    if (!existingInvitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (existingInvitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException('Invitation has already been processed');
    }

    const updateResult = await this.prismaService.eventInvitation.updateMany({
      where: {
        id: invitationId,
        eventId,
        status: InvitationStatus.PENDING,
      },
      data: {
        status: InvitationStatus.REVOKED,
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException(
        'Event has already been changed. Reload it and try again',
      );
    }

    return this.prismaService.eventInvitation.findUnique({
      where: {
        id: invitationId,
        eventId,
      },
    });
  }
}
