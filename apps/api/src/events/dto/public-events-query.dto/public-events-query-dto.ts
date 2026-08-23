import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ParticipationPolicy } from '../../../generated/prisma/enums';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PublicEventsQueryDto {
  @ApiPropertyOptional({ example: 'games', minLength: 3, maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00+03:00',
    format: 'date-time',
  })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00+03:00',
    format: 'date-time',
  })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({
    enum: ParticipationPolicy,
    example: ParticipationPolicy.OPEN_REGISTRATION,
  })
  @IsOptional()
  @IsEnum(ParticipationPolicy)
  participationPolicy?: ParticipationPolicy;

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
