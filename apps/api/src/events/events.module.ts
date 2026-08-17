import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { PublicEventsController } from './public-events.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [EventsService],
  controllers: [EventsController, PublicEventsController],
})
export class EventsModule {}
