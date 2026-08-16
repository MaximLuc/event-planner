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

@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventService: EventsService) {}

  @Post()
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventService.createDraft(user.userId, dto);
  }

  @Get()
  getEvents(@CurrentUser() user: AuthenticatedUser) {
    return this.eventService.findAllOwnedBy(user.userId);
  }

  @Get(':eventId')
  getEventById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.eventService.findOwnedById(user.userId, eventId);
  }

  @Patch(':eventId')
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventService.updateDraft(user.userId, eventId, dto);
  }

  @Patch(':eventId/access')
  updateAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventAccessDto,
  ) {
    return this.eventService.updateAccess(user.userId, eventId, dto);
  }
}
