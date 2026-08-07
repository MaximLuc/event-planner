import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateSessionData } from './types/create-session-data.type';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateSessionData) {
    return this.prisma.session.create({
      data: {
        id: data.id,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,

        user: {
          connect: {
            id: data.userId,
          },
        },
      },
    });
  }

  findActiveById(sessionId: string) {
    return this.prisma.session.findFirst({
      where: {
        id: sessionId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  rotate(sessionId: string, refreshTokenHash: string, expiresAt: Date) {
    return this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        refreshTokenHash,
        expiresAt,
      },
    });
  }

  revoke(sessionId: string) {
    return this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  revokeAllByUserId(userId: string) {
    return this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
