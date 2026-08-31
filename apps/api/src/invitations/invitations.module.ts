import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MyInvitationsController } from './my-invitations/my-invitations.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [InvitationsController, MyInvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
