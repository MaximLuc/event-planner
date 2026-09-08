import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check API health' })
  @ApiOkResponse({ description: 'API is healthy' })
  getHealth() {
    return { status: 'ok' };
  }

  @Get('database')
  @ApiOperation({ summary: 'Check database connection' })
  @ApiOkResponse({ description: 'Database connection is healthy' })
  async checkDatabase() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
    };
  }

  @Get('redis')
  async checkRedis() {
    const key = 'health-Check';

    try {
      await this.cacheManager.set(key, 'ok', 5_000);
      const value = await this.cacheManager.get<string>(key);
      await this.cacheManager.del(key);

      if (value !== 'ok') {
        throw new Error('Unexpected value received from Redis');
      }

      return {
        status: 'ok',
        redis: 'connected',
      };
    } catch {
      throw new ServiceUnavailableException('Redis is unavailable');
    }
  }
}
