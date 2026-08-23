import { Controller, Get, Param, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { PublicEventsQueryDto } from './dto/public-events-query.dto/public-events-query-dto';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Public events')
@Controller('public/events')
export class PublicEventsController {
  constructor(private readonly eventService: EventsService) {}
  @Get()
  @ApiOperation({ summary: 'Browse published public events' })
  @ApiOkResponse({ description: 'Paginated public events returned' })
  findAll(@Query() query: PublicEventsQueryDto) {
    return this.eventService.findPublicEvents(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a public or unlisted event by slug' })
  @ApiParam({ name: 'slug', example: 'board-games-evening-a1b2c3' })
  @ApiOkResponse({ description: 'Public event returned' })
  @ApiNotFoundResponse({ description: 'Public event not found' })
  findBySlug(@Param('slug') slug: string) {
    return this.eventService.findPublicBySlug(slug);
  }
}
