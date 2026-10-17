import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export async function cleanRateLimits(app: INestApplication): Promise<void> {
  const configService = app.get(ConfigService);

  const redis = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
    lazyConnect: true,
  });

  try {
    await redis.connect();

    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        'event-planner:rate-limit:*',
        'COUNT',
        100,
      );

      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.unlink(...keys);
      }
    } while (cursor !== '0');
  } finally {
    redis.disconnect();
  }
}
