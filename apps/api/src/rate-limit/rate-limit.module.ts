import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModule,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService): ThrottlerModuleOptions => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: 60,
            blockDuration: 60_000,
          },
        ],

        storage: new ThrottlerStorageRedisService(
          configService.getOrThrow<string>('REDIS_URL'),
          {
            keyPrefix: 'event-planner:rate-limit:',
          },
        ),
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class RateLimitModule {}
