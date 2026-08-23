import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard/jwt-auth.guard';
import * as jwtPayloadType from '../auth/types/jwt-payload.type';
import { RegistrationsService } from './registrations.service';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { BidProcessingDto } from './dto/bid-processing.dto/bid-processing.dto';
import { EventRegistrationsQueryDto } from './dto/event-registrations-query.dto/event-registrations-query.dto';
import {
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

@ApiTags('Registrations')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Access token is missing or invalid' })
@UseGuards(JwtAuthGuard)
@Controller('events')
export class RegistrationsController {
  constructor(private readonly registrationService: RegistrationsService) {}

  @Post(':slug/registrations')
  @ApiOperation({ summary: 'Register the current user for an event' })
  @ApiParam({ name: 'slug', example: 'board-games-evening-a1b2c3' })
  @ApiCreatedResponse({ description: 'Registration created' })
  @ApiForbiddenResponse({
    description: 'Registration is forbidden by event rules',
  })
  @ApiNotFoundResponse({ description: 'Event is not available' })
  @ApiConflictResponse({
    description: 'Already registered or no places available',
  })
  eventRegistration(
    @CurrentUser() user: jwtPayloadType.AuthenticatedUser,
    @Param('slug') slug: string,
  ) {
    return this.registrationService.register(user.userId, slug);
  }

  @Delete(':slug/registrations/me')
  @ApiOperation({ summary: 'Cancel the current user registration' })
  @ApiParam({ name: 'slug', example: 'board-games-evening-a1b2c3' })
  @ApiOkResponse({ description: 'Registration cancelled' })
  @ApiNotFoundResponse({
    description: 'Event or active registration not found',
  })
  @ApiForbiddenResponse({
    description: 'Event owner cannot unregister as a participant',
  })
  deleteRegistration(
    @CurrentUser() user: jwtPayloadType.AuthenticatedUser,
    @Param('slug') slug: string,
  ) {
    return this.registrationService.deleteRegistration(user.userId, slug);
  }

  @Get(':eventId/registrations')
  @ApiOperation({ summary: 'List registrations for an owned event' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ description: 'Paginated registrations returned' })
  @ApiNotFoundResponse({ description: 'Owned event not found' })
  getEventRegistrations(
    @CurrentUser() user: jwtPayloadType.AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: EventRegistrationsQueryDto,
  ) {
    return this.registrationService.eventRegistrations(
      user.userId,
      eventId,
      query,
    );
  }

  @Patch(':eventId/registrations/:registrationId')
  @ApiOperation({ summary: 'Approve or reject a pending registration' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiParam({ name: 'registrationId', format: 'uuid' })
  @ApiOkResponse({ description: 'Registration processed' })
  @ApiNotFoundResponse({ description: 'Owned event not found' })
  @ApiConflictResponse({
    description: 'Registration was already processed or event capacity is full',
  })
  approvedOrRejectedBid(
    @CurrentUser() user: jwtPayloadType.AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() dto: BidProcessingDto,
  ) {
    return this.registrationService.approveOrReject(
      user.userId,
      eventId,
      registrationId,
      dto,
    );
  }
}
