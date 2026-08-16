import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto/create-event.dto';
import slugify from 'slugify';
import { randomBytes } from 'node:crypto';
import { UpdateEventDto } from './dto/update-event.dto/update-event.dto';
import { EventStatus } from '../generated/prisma/enums';
import { UpdateEventAccessDto } from './dto/update-event-access.dto/update-event-access.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prismaService: PrismaService) {}

  createDraft(ownerId: string, dto: CreateEventDto) {
    const baseSlug = slugify(dto.title, {
      lower: true,
      strict: true,
      trim: true,
    });
    const suffix = randomBytes(3).toString('hex');

    const slug = `${baseSlug || 'event'}-${suffix}`;
    return this.prismaService.event.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        slug,

        owner: {
          connect: {
            id: ownerId,
          },
        },
      },
    });
  }

  findAllOwnedBy(ownerId: string) {
    return this.prismaService.event.findMany({
      where: {
        ownerId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findOwnedById(ownerId: string, eventId: string) {
    const event = await this.prismaService.event.findUnique({
      where: {
        ownerId,
        id: eventId,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async updateDraft(ownerId: string, eventId: string, dto: UpdateEventDto) {
    const event = await this.findOwnedById(ownerId, eventId);
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException('Only draft events can be edited');
    }

    const nextStartsAt =
      dto.startsAt === undefined
        ? event.startsAt
        : dto.startsAt === null
          ? null
          : new Date(dto.startsAt);

    const nextEndsAt =
      dto.endsAt === undefined
        ? event.endsAt
        : dto.endsAt === null
          ? null
          : new Date(dto.endsAt);
    if (nextStartsAt && nextEndsAt && nextEndsAt <= nextStartsAt) {
      throw new BadRequestException(
        'Event end date must be later than start date',
      );
    }

    const updateResult = await this.prismaService.event.updateMany({
      where: {
        id: eventId,
        ownerId,
        status: EventStatus.DRAFT,
        version: dto.expectedVersion,
      },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.description !== undefined && {
          description: dto.description?.trim() || null,
        }),
        ...(dto.capacity !== undefined && {
          capacity: dto.capacity,
        }),

        ...(dto.startsAt !== undefined && {
          startsAt: nextStartsAt,
        }),

        ...(dto.endsAt !== undefined && {
          endsAt: nextEndsAt,
        }),

        ...(dto.timezone !== undefined && {
          timezone: dto.timezone.trim(),
        }),

        version: {
          increment: 1,
        },
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException(
        'Event has already been changed. Reload it and try again',
      );
    }

    return this.prismaService.event.findUniqueOrThrow({
      where: {
        id: eventId,
      },
    });
  }

  async updateAccess(
    ownerId: string,
    eventId: string,
    dto: UpdateEventAccessDto,
  ) {
    const event = await this.findOwnedById(ownerId, eventId);

    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        'Access settings can only be changed for draft events',
      );
    }
    const updateResult = await this.prismaService.event.updateMany({
      where: {
        id: eventId,
        ownerId,
        status: EventStatus.DRAFT,
        version: dto.expectedVersion,
      },
      data: {
        ...(dto.visibility !== undefined && {
          visibility: dto.visibility,
        }),
        ...(dto.participationPolicy !== undefined && {
          participationPolicy: dto.participationPolicy,
        }),
        version: {
          increment: 1,
        },
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException(
        'Access settings can only be changed for draft events',
      );
    }

    return this.prismaService.event.findUniqueOrThrow({
      where: {
        id: eventId,
      },
    });
  }
}
