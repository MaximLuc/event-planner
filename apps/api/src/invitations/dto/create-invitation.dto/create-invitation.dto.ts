import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({ example: 'max@example.com' })
  @IsEmail()
  email!: string;
}
