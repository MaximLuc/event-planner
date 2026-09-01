import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SystemRole } from '../../src/generated/prisma/enums';

export function createAccessToken(
  app: INestApplication,
  userId: string,
): Promise<string> {
  const jwtService = app.get(JwtService);

  return jwtService.signAsync({
    sub: userId,
    role: SystemRole.USER,
  });
}
