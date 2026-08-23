import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'max@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Max', minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'strong-password', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
