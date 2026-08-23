import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PublishEventDto {
  @ApiProperty({ example: 3, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
