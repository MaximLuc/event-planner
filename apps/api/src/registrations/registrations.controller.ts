import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard/jwt-auth.guard';
import * as jwtPayloadType from '../auth/types/jwt-payload.type';
import { RegistrationsService } from './registrations.service';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('events')
export class RegistrationsController {
  constructor(private readonly registrationService: RegistrationsService) {}

  @Post(':slug/registrations')
  eventRegistration(
    @CurrentUser() user: jwtPayloadType.AuthenticatedUser,
    @Param('slug') slug: string,
  ) {
    return this.registrationService.register(user.userId, slug);
  }
}
