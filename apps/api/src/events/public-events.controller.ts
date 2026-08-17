import { Controller, Get, Param, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { PublicEventsQueryDto } from './dto/public-events-query.dto/public-events-query-dto';

@Controller('public/events')
export class PublicEventsController {
  constructor(private readonly eventService: EventsService) {}
  @Get()
  findAll(@Query() query: PublicEventsQueryDto) {
    return this.eventService.findPublicEvents(query);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.eventService.findPublicBySlug(slug);
  }
}
