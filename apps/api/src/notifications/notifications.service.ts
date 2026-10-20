import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import {
  NOTIFICATIONS_QUEUE,
  SEND_INVITATION_NOTIFICATION,
} from './notifications.constants';
import { Queue } from 'bullmq';
import { InvitationNotificationJob } from './invitation-notification-job.type';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationQueue: Queue<
      InvitationNotificationJob,
      void,
      typeof SEND_INVITATION_NOTIFICATION
    >,
  ) {}

  enqueueInvitationNotification(invitationId: string) {
    return this.notificationQueue.add(SEND_INVITATION_NOTIFICATION, {
      invitationId,
    });
  }
}
