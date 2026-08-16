import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateEventDto {
  @IsString()
  @MaxLength(120)
  @MinLength(3)
  @IsOptional()
  title?: string;

  @MaxLength(5000)
  @IsOptional()
  @IsString()
  description?: string | null;

  @IsInt()
  @IsOptional()
  @Min(1)
  capacity?: number | null;
  @IsDateString()
  @IsOptional()
  startsAt?: string | null;

  @IsDateString()
  @IsOptional()
  endsAt?: string | null;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
