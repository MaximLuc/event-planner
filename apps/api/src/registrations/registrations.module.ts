import { Module } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MyRegistrationsController } from './my-registrations.controller';

@Module({
  imports: [AuthModule, DatabaseModule],
  providers: [RegistrationsService],
  controllers: [RegistrationsController, MyRegistrationsController],
})
export class RegistrationsModule {}
