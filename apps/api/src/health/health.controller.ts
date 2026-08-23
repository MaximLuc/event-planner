import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {
    this.prisma = prisma;
  }
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
}
