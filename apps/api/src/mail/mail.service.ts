import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  // Plain text is always sent; the HTML part is optional but preferred by
  // every mail client that supports it.
  text: string;
  html?: string;
}

// Where links in emails point. The API doesn't serve the app, so it has to be
// told the web app's address.
export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

function transportConfig() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  return {
    host,
    port,
    // Implicit TLS on 465; everything else upgrades with STARTTLS.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    ...(user ? { auth: { user, pass } } : {}),
  };
}

// Sends the account emails (verification, password reset, welcome). With no
// SMTP_HOST configured nothing is sent: each message is written to the log
// instead, links and all, so the whole flow still works on a fresh checkout
// without anyone having to set up a mail server first.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private readonly config = transportConfig();

  constructor() {
    if (!this.config) {
      this.logger.warn('SMTP_HOST is not set — emails will be written to this log instead of sent');
    }
  }

  get enabled() {
    return this.config !== null;
  }

  private from() {
    return process.env.MAIL_FROM ?? 'LivePresentation <no-reply@livepresentation.local>';
  }

  // Created on first use rather than at boot, so a misconfigured mail server
  // can't stop the API from starting.
  private transport(): Transporter {
    if (!this.transporter) this.transporter = nodemailer.createTransport(this.config!);
    return this.transporter;
  }

  // Never throws: a mail server being down must not fail the request that
  // triggered the email (a registration, say). The caller's flow continues and
  // the failure is logged.
  async send(message: MailMessage): Promise<boolean> {
    if (!this.config) {
      this.logger.log(
        `[mail disabled] To: ${message.to}\nSubject: ${message.subject}\n${message.text}`,
      );
      return false;
    }
    try {
      await this.transport().sendMail({ from: this.from(), ...message });
      this.logger.log(`Sent "${message.subject}" to ${message.to}`);
      return true;
    } catch (err) {
      this.logger.error(`Could not send "${message.subject}" to ${message.to}`, err);
      return false;
    }
  }

  // Checks the SMTP settings without sending anything (Admin → App settings).
  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.config) return { ok: false, error: 'SMTP_HOST is not set' };
    try {
      await this.transport().verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not reach the mail server' };
    }
  }
}
