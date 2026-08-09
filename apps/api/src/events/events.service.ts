import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto/create-event.dto';
import slugify from 'slugify';
import { randomBytes } from 'node:crypto';

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
}
