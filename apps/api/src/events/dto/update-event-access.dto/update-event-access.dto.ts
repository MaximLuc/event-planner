import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import {
  EventVisibility,
  ParticipationPolicy,
} from '../../../generated/prisma/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEventAccessDto {
  @ApiPropertyOptional({
    enum: EventVisibility,
    example: EventVisibility.PUBLIC,
  })
  @IsEnum(EventVisibility)
  @IsOptional()
  visibility?: EventVisibility;

  @ApiPropertyOptional({
    enum: ParticipationPolicy,
    example: ParticipationPolicy.APPROVAL_REQUIRED,
  })
  @IsEnum(ParticipationPolicy)
  @IsOptional()
  participationPolicy?: ParticipationPolicy;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
