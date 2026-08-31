import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard/jwt-auth.guard';
import { InvitationsService } from '../invitations.service';
import { CurrentUser } from '../../auth/decorators/current-user/current-user.decorator';
import * as jwtPayloadType from '../../auth/types/jwt-payload.type';
import { RespondInvitationDto } from '../dto/respond-invitation.dto/respond-invitation.dto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@ApiTags('Invitations')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Access token is missing or invalid' })
@Controller('invitations')
@UseGuards(JwtAuthGuard)
export class MyInvitationsController {
  constructor(private readonly invitationService: InvitationsService) {}

  @ApiOperation({ summary: 'List pending invitations for the current user' })
  @ApiOkResponse({ description: 'Pending invitations returned' })
  @Get('my')
  getMyInvitation(@CurrentUser() user: jwtPayloadType.AuthenticatedUser) {
    return this.invitationService.myInvitation(user.userId);
  }

  @ApiOperation({ summary: 'Accept or decline an event invitation' })
  @ApiParam({ name: 'invitationId', format: 'uuid' })
  @ApiOkResponse({ description: 'Invitation processed' })
  @ApiBadRequestResponse({
    description: 'Invalid invitation ID or response body',
  })
  @ApiNotFoundResponse({ description: 'Invitation not found' })
  @ApiConflictResponse({
    description:
      'Invitation was already processed, event is unavailable, or capacity is full',
  })
  @Patch(':invitationId/respond')
  respondInvitation(
    @CurrentUser() user: jwtPayloadType.AuthenticatedUser,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @Body() dto: RespondInvitationDto,
  ) {
    return this.invitationService.respondInvitation(
      user.userId,
      invitationId,
      dto,
    );
  }
}
