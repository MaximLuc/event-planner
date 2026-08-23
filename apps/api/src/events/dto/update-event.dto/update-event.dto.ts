import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEventDto {
  @ApiPropertyOptional({
    example: 'Updated event title',
    minLength: 3,
    maxLength: 120,
  })
  @IsString()
  @MaxLength(120)
  @MinLength(3)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    example: 'Updated description',
    maxLength: 5000,
    nullable: true,
  })
  @MaxLength(5000)
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ example: 30, minimum: 1, nullable: true })
  @IsInt()
  @IsOptional()
  @Min(1)
  capacity?: number | null;

  @ApiPropertyOptional({
    example: '2026-09-20T16:00:00+03:00',
    format: 'date-time',
    nullable: true,
  })
  @IsDateString()
  @IsOptional()
  startsAt?: string | null;

  @ApiPropertyOptional({
    example: '2026-09-20T20:00:00+03:00',
    format: 'date-time',
    nullable: true,
  })
  @IsDateString()
  @IsOptional()
  endsAt?: string | null;

  @ApiPropertyOptional({ example: 'Europe/Moscow' })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
