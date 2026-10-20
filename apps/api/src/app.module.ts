import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SessionsModule } from './sessions/sessions.module';
import { EventsModule } from './events/events.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { InvitationsModule } from './invitations/invitations.module';
import { RedisCacheModule } from './cache/redis-cache.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { QueueModule } from './queue/queue.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MailModule } from './mail/mail.module';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().port().default(3000),
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        DATABASE_URL: Joi.string().uri().required(),
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_TTL_SECONDS: Joi.number()
          .integer()
          .positive()
          .default(2592000),
        REDIS_URL: Joi.string().uri().required(),
        SMTP_HOST: Joi.string().required(),
        SMTP_PORT: Joi.number().port().required(),
        SMTP_SECURE: Joi.boolean().default(false),
        MAIL_FROM: Joi.string()
          .email({ tlds: { allow: false } })
          .required(),
      }),
    }),
    HealthModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
    SessionsModule,
    EventsModule,
    RegistrationsModule,
    InvitationsModule,
    RedisCacheModule,
    RateLimitModule,
    QueueModule,
    NotificationsModule,
    MailModule,
  ],
})
export class AppModule {}
