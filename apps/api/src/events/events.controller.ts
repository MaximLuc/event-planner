import {
  Body,
  Controller,
  Post,
  UseGuards,
  Get,
  ParseUUIDPipe,
  Param,
  Patch,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { CreateEventDto } from './dto/create-event.dto/create-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { UpdateEventDto } from './dto/update-event.dto/update-event.dto';
import { UpdateEventAccessDto } from './dto/update-event-access.dto/update-event-access.dto';
import { PublishEventDto } from './dto/publish-event.dto/publish-event.dto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@ApiTags('Owner events')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Access token is missing or invalid' })
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventService: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an event draft' })
  @ApiCreatedResponse({ description: 'Draft created' })
  @ApiBadRequestResponse({ description: 'Invalid event data' })
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventService.createDraft(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List events owned by the current user' })
  @ApiOkResponse({ description: 'Owned events returned' })
  getEvents(@CurrentUser() user: AuthenticatedUser) {
    return this.eventService.findAllOwnedBy(user.userId);
  }

  @Get(':eventId')
  @ApiOperation({ summary: 'Get an owned event by ID' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ description: 'Event returned' })
  @ApiNotFoundResponse({ description: 'Event not found' })
  getEventById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.eventService.findOwnedById(user.userId, eventId);
  }

  @Patch(':eventId')
  @ApiOperation({ summary: 'Update an event draft' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ description: 'Draft updated' })
  @ApiBadRequestResponse({ description: 'Invalid event data or dates' })
  @ApiConflictResponse({
    description: 'Event is not a draft or version is stale',
  })
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventService.updateDraft(user.userId, eventId, dto);
  }

  @Patch(':eventId/access')
  @ApiOperation({ summary: 'Update event visibility and participation policy' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ description: 'Access settings updated' })
  @ApiConflictResponse({
    description: 'Event is not a draft or version is stale',
  })
  updateAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventAccessDto,
  ) {
    return this.eventService.updateAccess(user.userId, eventId, dto);
  }

  @Post(':eventId/publish')
  @ApiOperation({ summary: 'Publish an event draft' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'Event published' })
  @ApiBadRequestResponse({ description: 'Event is not ready for publication' })
  @ApiConflictResponse({
    description: 'Event is not a draft or version is stale',
  })
  publishEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: PublishEventDto,
  ) {
    return this.eventService.publish(user.userId, eventId, dto);
  }
}
