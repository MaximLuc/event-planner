import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { setTimeout as delay } from 'node:timers/promises';
import type { InvitationNotificationJob } from '../../src/notifications/invitation-notification-job.type';
import {
  NOTIFICATIONS_QUEUE,
  SEND_INVITATION_NOTIFICATION,
} from '../../src/notifications/notifications.constants';

export type NotificationQueue = Queue<
  InvitationNotificationJob,
  void,
  typeof SEND_INVITATION_NOTIFICATION
>;

export type NotificationJob = Job<
  InvitationNotificationJob,
  void,
  typeof SEND_INVITATION_NOTIFICATION
>;

export function getNotificationQueue(app: INestApplication): NotificationQueue {
  return app.get<NotificationQueue>(getQueueToken(NOTIFICATIONS_QUEUE));
}

export async function getNotificationJobs(
  queue: NotificationQueue,
): Promise<NotificationJob[]> {
  return queue.getJobs(['wait', 'active', 'delayed', 'completed', 'failed']);
}

// Poll a specific job, not elapsed time: a slow CI machine must still be correct.
export async function waitForNotificationJob(
  queue: NotificationQueue,
  job: NotificationJob,
  expectedState: 'completed' | 'failed' = 'completed',
): Promise<void> {
  const deadline = Date.now() + 10_000;
  let state: string;

  do {
    state = await job.getState();

    if (state === expectedState) {
      return;
    }

    if (state === 'failed' || state === 'completed' || state === 'unknown') {
      const storedJob = await queue.getJob(job.id!);
      throw new Error(
        `Job ${job.id}: expected ${expectedState}, got ${state}. ${storedJob?.failedReason ?? ''}`,
      );
    }

    await delay(25);
  } while (Date.now() < deadline);

  throw new Error(
    `Job ${job.id} did not reach ${expectedState}; last state: ${state}`,
  );
}
