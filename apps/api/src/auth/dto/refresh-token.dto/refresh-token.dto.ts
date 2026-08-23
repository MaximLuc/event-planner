import { IsJWT, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'JWT refresh token' })
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refreshToken!: string;
}
