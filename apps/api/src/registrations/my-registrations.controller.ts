import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import * as jwtPayloadType from '../auth/types/jwt-payload.type';
import { EventRegistrationsQueryDto } from './dto/event-registrations-query.dto/event-registrations-query.dto';
import { RegistrationsService } from './registrations.service';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@ApiTags('Registrations')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Access token is missing or invalid' })
@Controller('registrations')
@UseGuards(JwtAuthGuard)
export class MyRegistrationsController {
  constructor(private readonly registrationService: RegistrationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'List registrations of the current user' })
  @ApiOkResponse({ description: 'Paginated user registrations returned' })
  @ApiBadRequestResponse({ description: 'Invalid status or pagination query' })
  myRegistrations(
    @CurrentUser() user: jwtPayloadType.AuthenticatedUser,
    @Query() query: EventRegistrationsQueryDto,
  ) {
    return this.registrationService.findMyRegistrations(user.userId, query);
  }
}
