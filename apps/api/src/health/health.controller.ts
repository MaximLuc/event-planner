import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {
    this.prisma = prisma;
  }
  @Get()
  getHealth() {
    return { status: 'ok' };
  }

  @Get('database')
  async checkDatabase() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
    };
  }
}
