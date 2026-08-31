import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import * as jwtPayloadType from '../auth/types/jwt-payload.type';
import { CreateInvitationDto } from './dto/create-invitation.dto/create-invitation.dto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { EventInvitationsQueryDto } from './dto/event-invitations-query.dto/event-invitations-query.dto';

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

  @ApiOperation({ summary: 'List invitations for an owned event' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ description: 'Paginated invitations returned' })
  @ApiBadRequestResponse({
    description: 'Invalid event ID or query parameters',
  })
  @ApiNotFoundResponse({ description: 'Owned event not found' })
  @Get(':eventId/invitations')
  invitationsList(
    @CurrentUser() user: jwtPayloadType.AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: EventInvitationsQueryDto,
  ) {
    return this.invitationsService.findEventInvitations(
      user.userId,
      eventId,
      query,
    );
  }

  @ApiOperation({ summary: 'Revoke a pending event invitation' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiParam({ name: 'invitationId', format: 'uuid' })
  @ApiOkResponse({ description: 'Invitation revoked' })
  @ApiBadRequestResponse({ description: 'Invalid event or invitation ID' })
  @ApiNotFoundResponse({
    description: 'Owned event or invitation not found',
  })
  @ApiConflictResponse({
    description: 'Invitation has already been processed',
  })
  @Patch(':eventId/invitations/:invitationId/revoke')
  revokeInvitation(
    @CurrentUser() user: jwtPayloadType.AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ) {
    return this.invitationsService.revoke(user.userId, eventId, invitationId);
  }
}
