import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: 'Board games evening', minLength: 3, maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({
    example: 'An informal board games meetup',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}
