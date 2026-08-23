import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { RegistrationStatus } from '../../../generated/prisma/enums';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EventRegistrationsQueryDto {
  @ApiPropertyOptional({ enum: RegistrationStatus })
  @IsEnum(RegistrationStatus)
  @IsOptional()
  status?: RegistrationStatus;

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
