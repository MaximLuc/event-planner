import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  NOTIFICATIONS_QUEUE,
  SEND_INVITATION_NOTIFICATION,
} from './notifications.constants';
import type { InvitationNotificationJob } from './invitation-notification-job.type';
import { PrismaService } from '../database/prisma/prisma.service';
import { EventStatus, InvitationStatus } from '../generated/prisma/enums';
import { MailService } from '../mail/mail.service';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<InvitationNotificationJob, void>): Promise<void> {
    if (job.name !== SEND_INVITATION_NOTIFICATION) {
      throw new Error(`Unknown notification job: ${job.name}`);
    }

    const { invitationId } = job.data;

    const invitation = await this.prismaService.eventInvitation.findUnique({
      where: {
        id: invitationId,
      },
      select: {
        id: true,
        status: true,
        invitedUser: {
          select: {
            name: true,
            email: true,
          },
        },
        event: {
          select: {
            title: true,
            status: true,
            startsAt: true,
            owner: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!invitation) {
      await job.log('Skipped: invitation no longer exists');
      return;
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      await job.log(`Skipped: invitation status is ${invitation.status}`);
      return;
    }

    const event = invitation.event;

    if (
      event.status !== EventStatus.PUBLISHED ||
      !event.startsAt ||
      event.startsAt <= new Date()
    ) {
      await job.log('Skipped: event is unavailable or has already started');
      return;
    }

    const message =
      `${invitation.invitedUser.name}, ` +
      `${event.owner.name} пригласил вас ` +
      `на мероприятие «${event.title}».`;

    await this.mailService.send({
      to: invitation.invitedUser.email,
      subject: `Приглашение на мероприятие «${event.title}»`,
      text: message,
    });

    await job.log(
      `Invitation email accepted by SMTP for invitation ${invitation.id}`,
    );

    this.logger.log(
      `Job ${job.id}: invitation ${invitation.id} email accepted by SMTP`,
    );
  }
}
