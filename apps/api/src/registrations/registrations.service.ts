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
import { Prisma } from '../generated/prisma/client';
import { BidProcessingDto } from './dto/bid-processing.dto/bid-processing.dto';
import { EventRegistrationsQueryDto } from './dto/event-registrations-query.dto/event-registrations-query.dto';

const MAX_TRANSACTION_RETRIES = 3;
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

    const registrationStatus =
      event.participationPolicy === ParticipationPolicy.OPEN_REGISTRATION
        ? RegistrationStatus.APPROVED
        : RegistrationStatus.PENDING;

    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
      try {
        return await this.prismaService.$transaction(
          async (transaction) => {
            const existingRegistration =
              await transaction.eventRegistration.findUnique({
                where: {
                  eventId_userId: {
                    eventId: event.id,
                    userId,
                  },
                },
              });
            if (existingRegistration) {
              throw new ConflictException(
                'You are already registered for this event',
              );
            }

            if (
              registrationStatus === RegistrationStatus.APPROVED &&
              event.capacity !== null
            ) {
              const approvedCount = await transaction.eventRegistration.count({
                where: {
                  eventId: event.id,
                  status: RegistrationStatus.APPROVED,
                },
              });

              if (approvedCount >= event.capacity) {
                throw new ConflictException('No available places');
              }
            }
            return transaction.eventRegistration.create({
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
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            throw new ConflictException(
              'You are already registered for this event',
            );
          }
          if (error.code === 'P2034') {
            if (attempt < MAX_TRANSACTION_RETRIES) {
              continue;
            }
            throw new ConflictException(
              'Registration conflict. Please try again',
            );
          }
          throw error;
        }
        throw error;
      }
    }
    throw new ConflictException('Registration could not be completed');
  }
  async deleteRegistration(userId: string, slug: string) {
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
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.ownerId === userId) {
      throw new ForbiddenException(
        'Event owner cannot Unregister as a participant',
      );
    }

    const updateResult = await this.prismaService.eventRegistration.updateMany({
      where: {
        eventId: event.id,
        userId,
        status: {
          in: [RegistrationStatus.APPROVED, RegistrationStatus.PENDING],
        },
      },
      data: {
        status: RegistrationStatus.CANCELLED,
      },
    });

    if (updateResult.count === 0) {
      throw new NotFoundException('Active registration not found');
    }

    return {
      status: RegistrationStatus.CANCELLED,
    };
  }

  async eventRegistrations(
    userId: string,
    eventId: string,
    query: EventRegistrationsQueryDto,
  ) {
    const event = await this.prismaService.event.findUnique({
      where: {
        id: eventId,
        ownerId: userId,
      },
      select: {
        id: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Not found event or user don have event');
    }

    const where: Prisma.EventRegistrationWhereInput = {
      eventId,
      ...(query.status && {
        status: query.status,
      }),
    };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prismaService.$transaction([
      this.prismaService.eventRegistration.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: query.limit,
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,

          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prismaService.eventRegistration.count({
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

  async approveOrReject(
    userId: string,
    eventId: string,
    registrationId: string,
    dto: BidProcessingDto,
  ) {
    const event = await this.prismaService.event.findUnique({
      where: {
        id: eventId,
        ownerId: userId,
      },
      select: {
        id: true,
        status: true,
        capacity: true,
        startsAt: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (
      event.status !== EventStatus.PUBLISHED ||
      !event.startsAt ||
      event.startsAt <= new Date()
    ) {
      throw new ConflictException(
        'Applications for this event can no longer be processed',
      );
    }

    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
      try {
        return await this.prismaService.$transaction(
          async (transaction) => {
            const registration = await transaction.eventRegistration.findFirst({
              where: {
                id: registrationId,
                eventId,
                status: RegistrationStatus.PENDING,
              },
            });
            if (!registration) {
              throw new ConflictException('Pending registration not found');
            }
            if (
              dto.status === RegistrationStatus.APPROVED &&
              event.capacity !== null
            ) {
              const approvedCount = await transaction.eventRegistration.count({
                where: {
                  eventId,
                  status: RegistrationStatus.APPROVED,
                },
              });

              if (approvedCount >= event.capacity) {
                throw new ConflictException('No available places');
              }
            }
            const updateResult = await transaction.eventRegistration.updateMany(
              {
                where: {
                  id: registrationId,
                  eventId,
                  status: RegistrationStatus.PENDING,
                },
                data: {
                  status: dto.status,
                },
              },
            );

            if (updateResult.count === 0) {
              throw new ConflictException(
                'Registration has already been processed',
              );
            }
            return transaction.eventRegistration.findUniqueOrThrow({
              where: {
                id: registrationId,
              },
              select: {
                id: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                user: {
                  select: {
                    name: true,
                    email: true,
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
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          if (attempt < MAX_TRANSACTION_RETRIES) {
            continue;
          }

          throw new ConflictException(
            'Application processing conflict. Please try again',
          );
        }

        throw error;
      }
    }

    throw new ConflictException('Application could not be processed');
  }

  async findMyRegistrations(userId: string, query: EventRegistrationsQueryDto) {
    const where: Prisma.EventRegistrationWhereInput = {
      userId,
      ...(query.status && {
        status: query.status,
      }),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prismaService.$transaction([
      this.prismaService.eventRegistration.findMany({
        where,
        orderBy: {
          event: {
            startsAt: 'asc',
          },
        },
        skip,
        take: query.limit,
        select: {
          id: true,
          status: true,
          createdAt: true,
          event: {
            select: {
              title: true,
              slug: true,
              startsAt: true,
              endsAt: true,
              timezone: true,
              status: true,
              owner: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prismaService.eventRegistration.count({
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
}
