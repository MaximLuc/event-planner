import { IsInt, Min } from 'class-validator';

export class PublishEventDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
