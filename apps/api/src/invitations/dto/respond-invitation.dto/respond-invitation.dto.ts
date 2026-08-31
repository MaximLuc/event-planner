import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class RespondInvitationDto {
  @ApiProperty({
    example: true,
    description: 'Accept or decline the invitation',
  })
  @IsBoolean()
  accepted!: boolean;
}
