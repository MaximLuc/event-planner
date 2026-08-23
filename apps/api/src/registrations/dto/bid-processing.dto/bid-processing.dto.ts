import { IsIn } from 'class-validator';
import { RegistrationStatus } from '../../../generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';

export class BidProcessingDto {
  @ApiProperty({
    enum: [RegistrationStatus.APPROVED, RegistrationStatus.REJECTED],
    example: RegistrationStatus.APPROVED,
  })
  @IsIn([RegistrationStatus.APPROVED, RegistrationStatus.REJECTED])
  status!: RegistrationStatus;
}
