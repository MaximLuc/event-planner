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

export class PublicEventsQueryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @IsOptional()
  @IsEnum(ParticipationPolicy)
  participationPolicy?: ParticipationPolicy;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
