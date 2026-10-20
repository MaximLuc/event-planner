import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { NotificationsProcessor } from '../../src/notifications/notifications.processor';
import { cleanCache } from './cache.helper';
import { cleanDatabase } from './database.helper';
import { clearMailpit } from './mailpit.helper';
import { getNotificationQueue } from './notifications.helper';
import { cleanRateLimits } from './rate-limit.helper';

export async function resetTestState(app: INestApplication): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetTestState is only available in the test environment');
  }

  const queue = getNotificationQueue(app);
  const worker = app.get(NotificationsProcessor).worker;

  await queue.pause();

  try {
    // pause() waits for an active job to finish; queue.pause() alone does not.
    await worker.pause();
    // Includes delayed retries and job history, not just waiting jobs.
    await queue.obliterate();
    await clearMailpit();
    await cleanDatabase(app.get(PrismaService));
    await cleanCache(app);
    await cleanRateLimits(app);
  } finally {
    try {
      await queue.resume();
    } finally {
      await worker.resume();
    }
  }
}
