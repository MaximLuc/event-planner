import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import * as jwtPayloadType from '../auth/types/jwt-payload.type';
import { CreateInvitationDto } from './dto/create-invitation.dto/create-invitation.dto';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@ApiTags('Invitations')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({
  description: 'Access token is missing or invalid',
})
@Controller('events')
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @ApiOperation({
    summary: 'Invite a registered user to an owned event',
  })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'Invitation created or renewed' })
  @ApiNotFoundResponse({
    description: 'Event or invited user not found',
  })
  @ApiForbiddenResponse({
    description: 'Event owner cannot invite themselves',
  })
  @ApiConflictResponse({
    description: 'User is already registered or invitation already exists',
  })
  @Post(':eventId/invitations')
  sendInvite(
    @CurrentUser() user: jwtPayloadType.AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.invite(user.userId, eventId, dto);
  }
}
