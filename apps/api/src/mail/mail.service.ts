import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

type SendMailData = {
  to: string;
  subject: string;
  text: string;
};

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(configService: ConfigService) {
    this.from = configService.getOrThrow<string>('MAIL_FROM');
    this.transporter = createTransport({
      host: configService.getOrThrow<string>('SMTP_HOST'),
      port: configService.getOrThrow<number>('SMTP_PORT'),
      secure: configService.getOrThrow<boolean>('SMTP_SECURE'),

      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
  }
  async send(data: SendMailData): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: data.to,
      subject: data.subject,
      text: data.text,
    });
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
