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
import { EventStatus, EventVisibility } from '../generated/prisma/enums';
import { UpdateEventAccessDto } from './dto/update-event-access.dto/update-event-access.dto';
import { PublishEventDto } from './dto/publish-event.dto/publish-event.dto';
import { PublicEventsQueryDto } from './dto/public-events-query.dto/public-events-query-dto';
import { Prisma } from '../generated/prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';

const PUBLIC_EVENTS_LIST_REVISION_KEY = 'public-events:list:revision';

const PUBLIC_EVENTS_CACHE_TTL_MS = 60_000;
@Injectable()
export class EventsService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  private async getPublicEventsListRevision(): Promise<string> {
    return (
      (await this.cacheManager.get<string>(PUBLIC_EVENTS_LIST_REVISION_KEY)) ??
      'initial'
    );
  }

  private async invalidatePublicEventsList(): Promise<void> {
    const newRevision = randomBytes(8).toString('hex');

    await this.cacheManager.set(
      PUBLIC_EVENTS_LIST_REVISION_KEY,
      newRevision,
      0,
    );
  }

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
        'Event has already been changed. Reload it and try again',
      );
    }

    return this.prismaService.event.findUniqueOrThrow({
      where: {
        id: eventId,
      },
    });
  }

  async publish(ownerId: string, eventId: string, dto: PublishEventDto) {
    const event = await this.findOwnedById(ownerId, eventId);
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException('Only draft events can be published');
    }
    if (!event.startsAt || !event.endsAt) {
      throw new BadRequestException(
        'Start and end dates are required for publication',
      );
    }

    if (event.endsAt <= event.startsAt) {
      throw new BadRequestException(
        'Event end date must be later than start date',
      );
    }

    if (event.startsAt <= new Date()) {
      throw new BadRequestException('Event start date must be in the future');
    }

    if (event.capacity !== null && event.capacity < 1) {
      throw new BadRequestException('Event capacity must be greater than zero');
    }
    const publishResult = await this.prismaService.event.updateMany({
      where: {
        id: eventId,
        ownerId,
        status: EventStatus.DRAFT,
        version: dto.expectedVersion,
      },
      data: {
        status: EventStatus.PUBLISHED,
        publishedAt: new Date(),
        version: {
          increment: 1,
        },
      },
    });

    if (publishResult.count === 0) {
      throw new ConflictException(
        'Event has already been changed. Reload it and try again',
      );
    }

    const publishedEvent = await this.prismaService.event.findUniqueOrThrow({
      where: {
        id: eventId,
      },
    });

    if (publishedEvent.visibility === EventVisibility.PUBLIC) {
      await this.invalidatePublicEventsList();
    }

    return publishedEvent;
  }

  async findPublicEvents(query: PublicEventsQueryDto) {
    const revision = await this.getPublicEventsListRevision();

    const cacheKey = `public-events:list:${revision}:${JSON.stringify({
      search: query.search?.trim().toLowerCase() ?? null,
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      participationPolicy: query.participationPolicy ?? null,
      page: query.page,
      limit: query.limit,
    })}`;

    return this.cacheManager.wrap(
      cacheKey,
      async () => {
        const now = new Date();

        const requestedFrom = query.dateFrom ? new Date(query.dateFrom) : null;
        const effectiveDateFrom =
          requestedFrom && requestedFrom > now ? requestedFrom : now;

        const where: Prisma.EventWhereInput = {
          status: EventStatus.PUBLISHED,
          visibility: EventVisibility.PUBLIC,
          startsAt: {
            gte: effectiveDateFrom,

            ...(query.dateTo && {
              lte: new Date(query.dateTo),
            }),
          },

          ...(query.search?.trim() && {
            title: {
              contains: query.search.trim(),
              mode: 'insensitive',
            },
          }),

          ...(query.participationPolicy && {
            participationPolicy: query.participationPolicy,
          }),
        };

        const skip = (query.page - 1) * query.limit;

        const [items, total] = await this.prismaService.$transaction([
          this.prismaService.event.findMany({
            where,
            orderBy: {
              startsAt: 'asc',
            },
            skip,
            take: query.limit,
            select: {
              title: true,
              slug: true,
              description: true,
              startsAt: true,
              endsAt: true,
              timezone: true,
              capacity: true,
              participationPolicy: true,
              owner: {
                select: {
                  name: true,
                },
              },
            },
          }),
          this.prismaService.event.count({
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
      },
      PUBLIC_EVENTS_CACHE_TTL_MS,
    );
  }

  async findPublicBySlug(slug: string) {
    const cacheKey = `public-events:detail:${slug}`;

    return this.cacheManager.wrap(
      cacheKey,
      async () => {
        const event = await this.prismaService.event.findFirst({
          where: {
            slug,
            status: EventStatus.PUBLISHED,
            visibility: {
              in: [EventVisibility.PUBLIC, EventVisibility.UNLISTED],
            },
          },
          select: {
            title: true,
            slug: true,
            description: true,
            startsAt: true,
            endsAt: true,
            timezone: true,
            capacity: true,
            participationPolicy: true,
            owner: {
              select: {
                name: true,
              },
            },
          },
        });

        if (!event) {
          throw new NotFoundException('Public event not found');
        }

        return event;
      },
      PUBLIC_EVENTS_CACHE_TTL_MS,
    );
  }
}
