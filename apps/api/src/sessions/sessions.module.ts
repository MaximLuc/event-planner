import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
