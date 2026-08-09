import {
  Body,
  Controller,
  Post,
  UseGuards,
  Get,
  ParseUUIDPipe,
  Param,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { CreateEventDto } from './dto/create-event.dto/create-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';

@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventServiсe: EventsService) {}

  @Post()
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventServiсe.createDraft(user.userId, dto);
  }

  @Get()
  getEvents(@CurrentUser() user: AuthenticatedUser) {
    return this.eventServiсe.findAllOwnedBy(user.userId);
  }

  @Get(':eventId')
  getEventById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.eventServiсe.findOwnedById(user.userId, eventId);
  }
}
