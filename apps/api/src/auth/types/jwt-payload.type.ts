import { SystemRole } from '../../generated/prisma/enums';

export type JwtPayload = {
  sub: string;
  role: SystemRole;
};

export type AuthenticatedUser = {
  userId: string;
  role: SystemRole;
};
