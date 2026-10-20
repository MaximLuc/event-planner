import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from './notifications.module';
import { NotificationsProcessor } from './notifications.processor';

@Module({
  imports: [NotificationsModule, DatabaseModule, MailModule],

  providers: [NotificationsProcessor],
})
export class NotificationsWorkerModule {}
