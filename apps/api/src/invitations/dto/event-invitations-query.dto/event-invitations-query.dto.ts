import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { InvitationStatus } from '../../../generated/prisma/enums';

export class EventInvitationsQueryDto {
  @ApiPropertyOptional({
    enum: InvitationStatus,
    description: 'Filter invitations by status',
  })
  @IsEnum(InvitationStatus)
  @IsOptional()
  status?: InvitationStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
