import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}
