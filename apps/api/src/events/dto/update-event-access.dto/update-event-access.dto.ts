import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import {
  EventVisibility,
  ParticipationPolicy,
} from '../../../generated/prisma/enums';

export class UpdateEventAccessDto {
  @IsEnum(EventVisibility)
  @IsOptional()
  visibility?: EventVisibility;

  @IsEnum(ParticipationPolicy)
  @IsOptional()
  participationPolicy?: ParticipationPolicy;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
