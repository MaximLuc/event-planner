import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createKeyv } from '@keyv/redis';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        stores: [
          createKeyv(configService.getOrThrow<string>('REDIS_URL'), {
            namespace: 'event-planner',
          }),
        ],
        ttl: 60_000,
      }),
    }),
  ],
  exports: [CacheModule],
})
export class RedisCacheModule {}
