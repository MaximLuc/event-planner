/// <reference types="jest" />

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { EventStatus, InvitationStatus } from '../src/generated/prisma/enums';
import { MailService } from '../src/mail/mail.service';
import { NotificationsProcessor } from '../src/notifications/notifications.processor';
import { NotificationsService } from '../src/notifications/notifications.service';
import { createAccessToken } from './helpers/auth.helper';
import { createTestApp } from './helpers/create-test-app';
import {
  createPublishedInviteOnlyEvent,
  createTestInvitation,
  createTestUser,
} from './helpers/factories';
import {
  getMailpitMessage,
  getMailpitMessages,
  waitForMailpitMessages,
} from './helpers/mailpit.helper';
import {
  getNotificationJobs,
  getNotificationQueue,
  type NotificationJob,
  type NotificationQueue,
  waitForNotificationJob,
} from './helpers/notifications.helper';
import { resetTestState } from './helpers/reset-test-state';

describe('Invitation notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mailService: MailService;
  let notifications: NotificationsService;
  let processor: NotificationsProcessor;
  let queue: NotificationQueue;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    mailService = app.get(MailService);
    notifications = app.get(NotificationsService);
    processor = app.get(NotificationsProcessor);
    queue = getNotificationQueue(app);
  });

  beforeEach(async () => {
    await resetTestState(app);
  });

  afterEach(async () => {
    try {
      // Do not restore a mock while a background job is still using it.
      await processor.worker.pause();
    } finally {
      jest.restoreAllMocks();
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function createScenario() {
    const owner = await createTestUser(prisma, { name: 'Организатор Максим' });
    const invitedUser = await createTestUser(prisma, { name: 'Участник Анна' });
    const event = await createPublishedInviteOnlyEvent(prisma, owner.id, {
      title: 'Вечер настольных игр',
    });
    const ownerToken = await createAccessToken(app, owner.id);

    return { owner, invitedUser, event, ownerToken };
  }

  async function invite(
    scenario: Awaited<ReturnType<typeof createScenario>>,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/events/${scenario.event.id}/invitations`)
      .set('Authorization', `Bearer ${scenario.ownerToken}`)
      .send({ email: scenario.invitedUser.email })
      .expect(201);

    const body = response.body as { id: string };
    expect(typeof body.id).toBe('string');
    return body.id;
  }

  async function findOnlyJob(invitationId: string): Promise<NotificationJob> {
    const jobs = (await getNotificationJobs(queue)).filter(
      (job) => job.data.invitationId === invitationId,
    );
    expect(jobs).toHaveLength(1);
    return jobs[0];
  }

  it('returns the HTTP response before sending and delivers the email through the real queue and SMTP', async () => {
    const scenario = await createScenario();
    await processor.worker.pause();

    const invitationId = await invite(scenario);
    const job = await findOnlyJob(invitationId);

    expect(job.data).toEqual({ invitationId });
    expect(await job.getState()).toBe('waiting');
    expect((await getMailpitMessages()).total).toBe(0);

    await processor.worker.resume();
    await waitForNotificationJob(queue, job);

    const [message] = await waitForMailpitMessages(1);
    const details = await getMailpitMessage(message.ID);
    expect(details.From.Address).toBe(process.env.MAIL_FROM);
    expect(details.To).toEqual([
      expect.objectContaining({ Address: scenario.invitedUser.email }),
    ]);
    expect(details.Subject).toBe(
      `Приглашение на мероприятие «${scenario.event.title}»`,
    );
    expect(details.Text).toContain(scenario.invitedUser.name);
    expect(details.Text).toContain(scenario.owner.name);
    expect(details.Text).toContain(scenario.event.title);
    expect(details.Text).not.toContain('password-is-not-used-in-this-test');
  });

  it('does not enqueue another job when a pending invitation already exists', async () => {
    const scenario = await createScenario();
    const invitationId = await invite(scenario);
    await waitForNotificationJob(queue, await findOnlyJob(invitationId));

    await request(app.getHttpServer())
      .post(`/api/v1/events/${scenario.event.id}/invitations`)
      .set('Authorization', `Bearer ${scenario.ownerToken}`)
      .send({ email: scenario.invitedUser.email })
      .expect(409);

    expect(await getNotificationJobs(queue)).toHaveLength(1);
    expect(await waitForMailpitMessages(1)).toHaveLength(1);
  });

  it('does not enqueue a job when the caller is not the owner', async () => {
    const scenario = await createScenario();
    const participantToken = await createAccessToken(
      app,
      scenario.invitedUser.id,
    );

    await request(app.getHttpServer())
      .post(`/api/v1/events/${scenario.event.id}/invitations`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ email: scenario.invitedUser.email })
      .expect(404);

    expect(await prisma.eventInvitation.count()).toBe(0);
    expect(await getNotificationJobs(queue)).toHaveLength(0);
    expect((await getMailpitMessages()).total).toBe(0);
  });

  it.each([InvitationStatus.DECLINED, InvitationStatus.REVOKED])(
    'sends a new email when a %s invitation is renewed with the same ID',
    async (status) => {
      const scenario = await createScenario();
      const invitationId = await invite(scenario);
      const firstJob = await findOnlyJob(invitationId);
      await waitForNotificationJob(queue, firstJob);
      await waitForMailpitMessages(1);

      if (status === InvitationStatus.DECLINED) {
        const token = await createAccessToken(app, scenario.invitedUser.id);
        await request(app.getHttpServer())
          .patch(`/api/v1/invitations/${invitationId}/respond`)
          .set('Authorization', `Bearer ${token}`)
          .send({ accepted: false })
          .expect(200);
      } else {
        await request(app.getHttpServer())
          .patch(
            `/api/v1/events/${scenario.event.id}/invitations/${invitationId}/revoke`,
          )
          .set('Authorization', `Bearer ${scenario.ownerToken}`)
          .expect(200);
      }

      expect(await invite(scenario)).toBe(invitationId);
      const jobs = await getNotificationJobs(queue);
      expect(jobs).toHaveLength(2);
      const renewedJob = jobs.find((job) => job.id !== firstJob.id);
      if (!renewedJob)
        throw new Error('No job was created for the renewed invitation');

      expect(renewedJob.data).toEqual({ invitationId });
      await waitForNotificationJob(queue, renewedJob);
      expect(await waitForMailpitMessages(2)).toHaveLength(2);
      const invitation = await prisma.eventInvitation.findUniqueOrThrow({
        where: { id: invitationId },
      });
      expect(invitation.status).toBe(InvitationStatus.PENDING);
      expect(invitation.respondedAt).toBeNull();
    },
  );

  it.each([
    InvitationStatus.ACCEPTED,
    InvitationStatus.DECLINED,
    InvitationStatus.REVOKED,
  ])('skips an invitation that became %s before processing', async (status) => {
    const scenario = await createScenario();
    await processor.worker.pause();
    const invitation = await createTestInvitation(
      prisma,
      scenario.event.id,
      scenario.invitedUser.id,
    );
    const job = await notifications.enqueueInvitationNotification(
      invitation.id,
    );

    await prisma.eventInvitation.update({
      where: { id: invitation.id },
      data: { status, respondedAt: new Date() },
    });
    const send = jest.spyOn(mailService, 'send');

    await processor.worker.resume();
    await waitForNotificationJob(queue, job);

    expect(send).not.toHaveBeenCalled();
    expect((await getMailpitMessages()).total).toBe(0);
    const { logs } = await queue.getJobLogs(job.id!);
    expect(logs).toContain(`Skipped: invitation status is ${status}`);
  });

  it('skips an invitation deleted before processing', async () => {
    const scenario = await createScenario();
    await processor.worker.pause();
    const invitation = await createTestInvitation(
      prisma,
      scenario.event.id,
      scenario.invitedUser.id,
    );
    const job = await notifications.enqueueInvitationNotification(
      invitation.id,
    );
    await prisma.eventInvitation.delete({ where: { id: invitation.id } });
    const send = jest.spyOn(mailService, 'send');

    await processor.worker.resume();
    await waitForNotificationJob(queue, job);

    expect(send).not.toHaveBeenCalled();
    expect((await getMailpitMessages()).total).toBe(0);
    const { logs } = await queue.getJobLogs(job.id!);
    expect(logs).toContain('Skipped: invitation no longer exists');
  });

  it.each([
    { name: 'draft', data: { status: EventStatus.DRAFT } },
    { name: 'cancelled', data: { status: EventStatus.CANCELLED } },
    { name: 'completed', data: { status: EventStatus.COMPLETED } },
    { name: 'already started', data: { startsAt: new Date(0) } },
    { name: 'without a start date', data: { startsAt: null } },
  ])(
    'skips an event that is $name when the worker reads it',
    async ({ data }) => {
      const scenario = await createScenario();
      await processor.worker.pause();
      const invitation = await createTestInvitation(
        prisma,
        scenario.event.id,
        scenario.invitedUser.id,
      );
      const job = await notifications.enqueueInvitationNotification(
        invitation.id,
      );
      await prisma.event.update({ where: { id: scenario.event.id }, data });
      const send = jest.spyOn(mailService, 'send');

      await processor.worker.resume();
      await waitForNotificationJob(queue, job);

      expect(send).not.toHaveBeenCalled();
      expect((await getMailpitMessages()).total).toBe(0);
      const { logs } = await queue.getJobLogs(job.id!);
      expect(logs).toContain(
        'Skipped: event is unavailable or has already started',
      );
    },
  );

  it('retries a temporary SMTP error and then really delivers one email', async () => {
    const scenario = await createScenario();
    const send = jest
      .spyOn(mailService, 'send')
      .mockRejectedValueOnce(new Error('Temporary SMTP connection failure'));

    const invitationId = await invite(scenario);
    const job = await findOnlyJob(invitationId);
    await waitForNotificationJob(queue, job);

    expect(send).toHaveBeenCalledTimes(2);
    expect(await waitForMailpitMessages(1)).toHaveLength(1);
    expect(await queue.getFailedCount()).toBe(0);
  });

  it('retries a temporary database error instead of silently losing the notification', async () => {
    const scenario = await createScenario();
    const invitation = await createTestInvitation(
      prisma,
      scenario.event.id,
      scenario.invitedUser.id,
    );
    const lookup = jest
      .spyOn(prisma.eventInvitation, 'findUnique')
      .mockRejectedValueOnce(
        new Error('Temporary database connection failure'),
      );

    const job = await notifications.enqueueInvitationNotification(
      invitation.id,
    );
    await waitForNotificationJob(queue, job);

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(await waitForMailpitMessages(1)).toHaveLength(1);
  });

  it('marks the job as failed after three SMTP failures without deleting the invitation', async () => {
    const scenario = await createScenario();
    const send = jest
      .spyOn(mailService, 'send')
      .mockRejectedValue(new Error('SMTP is unavailable'));

    const invitationId = await invite(scenario);
    const job = await findOnlyJob(invitationId);
    expect(job.opts.attempts).toBe(3);
    await waitForNotificationJob(queue, job, 'failed');

    expect(send).toHaveBeenCalledTimes(3);
    expect((await getMailpitMessages()).total).toBe(0);
    const failedJob = await queue.getJob(job.id!);
    expect(failedJob?.failedReason).toContain('SMTP is unavailable');
    const invitation = await prisma.eventInvitation.findUniqueOrThrow({
      where: { id: invitationId },
    });
    expect(invitation.status).toBe(InvitationStatus.PENDING);
  });

  it('waits for active delivery before clearing the queue, mailbox and database', async () => {
    const scenario = await createScenario();
    const invitation = await createTestInvitation(
      prisma,
      scenario.event.id,
      scenario.invitedUser.id,
    );
    let releaseSend!: () => void;
    let markStarted!: () => void;
    let markPausing!: () => void;
    const canSend = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const pausing = new Promise<void>((resolve) => {
      markPausing = resolve;
    });
    const realSend = mailService.send.bind(mailService);
    jest.spyOn(mailService, 'send').mockImplementationOnce(async (data) => {
      markStarted();
      await canSend;
      await realSend(data);
    });
    const realPause = processor.worker.pause.bind(processor.worker);
    jest.spyOn(processor.worker, 'pause').mockImplementation(async () => {
      markPausing();
      await realPause();
    });

    await notifications.enqueueInvitationNotification(invitation.id);
    await started;
    let resetFinished = false;
    const resetting = resetTestState(app).then(() => {
      resetFinished = true;
    });

    try {
      await pausing;
      expect(resetFinished).toBe(false);
      expect(await prisma.eventInvitation.count()).toBe(1);
    } finally {
      // Also release on assertion failure so the worker can shut down cleanly.
      releaseSend();
      await resetting;
    }

    expect(await getNotificationJobs(queue)).toHaveLength(0);
    expect((await getMailpitMessages()).total).toBe(0);
    expect(await prisma.eventInvitation.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(processor.worker.isPaused()).toBe(false);
    expect(await queue.isPaused()).toBe(false);
  });
});
