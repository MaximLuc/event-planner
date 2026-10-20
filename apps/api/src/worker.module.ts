import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { QueueModule } from './queue/queue.module';
import { NotificationsWorkerModule } from './notifications/notifications-worker.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,

      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),

        DATABASE_URL: Joi.string().uri().required(),
        REDIS_URL: Joi.string().uri().required(),

        SMTP_HOST: Joi.string().required(),
        SMTP_PORT: Joi.number().port().required(),
        SMTP_SECURE: Joi.boolean().default(false),

        MAIL_FROM: Joi.string()
          .email({ tlds: { allow: false } })
          .required(),
      }),
    }),
    QueueModule,
    NotificationsWorkerModule,
  ],
})
export class WorkerModule {}
