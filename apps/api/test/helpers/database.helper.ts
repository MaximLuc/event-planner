import { PrismaService } from '../../src/database/prisma/prisma.service';

export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$transaction([
    prisma.eventRegistration.deleteMany(),
    prisma.eventInvitation.deleteMany(),
    prisma.session.deleteMany(),
    prisma.event.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
