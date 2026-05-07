import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { log } from '@/lib/log';
import type { EmailTransport, OutboundEmail, SendResult } from './transport';

// Phase 1.9 — generic SMTP transport. Works with MailHog locally
// (SMTP_HOST=mailhog, SMTP_PORT=1025, no auth) and with any RFC-compliant
// provider in prod (Postmark / SES / Mailgun / Resend — all expose SMTP).
// We deliberately don't pull in provider-specific SDKs: the SMTP path is
// the lowest common denominator and lets the user swap providers without
// touching code, just by flipping env vars.

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromAddress: string;
  fromName: string;
}

function configFromEnv(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? '587');
  // STARTTLS on 587 / 25 (secure: false + Nodemailer auto-upgrade);
  // implicit TLS on 465 (secure: true). MailHog runs plain on 1025 — port
  // and `secure` together are the right knobs, not just one.
  const secure =
    process.env.SMTP_SECURE != null
      ? process.env.SMTP_SECURE === 'true'
      : port === 465;
  return {
    host,
    port,
    secure,
    ...(process.env.SMTP_USER ? { user: process.env.SMTP_USER } : {}),
    ...(process.env.SMTP_PASSWORD ? { password: process.env.SMTP_PASSWORD } : {}),
    fromAddress: process.env.SMTP_FROM_ADDRESS ?? 'no-reply@example.com',
    fromName: process.env.SMTP_FROM_NAME ?? 'Vendo Demo Clinic',
  };
}

export class SmtpTransport implements EmailTransport {
  readonly name = 'smtp';
  private readonly transporter: Transporter;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(cfg: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      // Auth block omitted entirely when no user is set — required for
      // MailHog (rejects AUTH commands) and other unauthenticated relays.
      ...(cfg.user
        ? { auth: { user: cfg.user, pass: cfg.password ?? '' } }
        : {}),
      // Tighter than Nodemailer defaults so a slow relay can't stall the
      // request handler. Failures fall through to the catch in send().
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
    this.fromAddress = cfg.fromAddress;
    this.fromName = cfg.fromName;
  }

  async send(msg: OutboundEmail): Promise<SendResult> {
    try {
      // EMAIL_OVERRIDE_TO redirects every outbound message to a single
      // inbox — used during prelaunch QA so we can sanity-check that
      // every trigger fires the right template without spamming real
      // referrers. The original recipient is encoded in the subject line
      // so the reviewer still knows who the message *would* have gone to.
      const override = process.env.EMAIL_OVERRIDE_TO?.trim();
      const finalTo = override ? override : (msg.toName ? { address: msg.to, name: msg.toName } : msg.to);
      const finalSubject = override
        ? `[QA → ${msg.to}] ${msg.content.subject}`
        : msg.content.subject;

      const info = await this.transporter.sendMail({
        from: { address: this.fromAddress, name: this.fromName },
        to: finalTo,
        replyTo: msg.replyTo,
        subject: finalSubject,
        text: msg.content.text,
        html: msg.content.html,
      });
      log.info('email_smtp_sent', {
        to: msg.to,
        messageId: info.messageId,
        accepted: info.accepted?.length ?? 0,
        rejected: info.rejected?.length ?? 0,
      });
      return { ok: true, id: info.messageId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error('email_smtp_failed', { to: msg.to, error });
      return { ok: false, error };
    }
  }
}

export function trySmtpTransportFromEnv(): SmtpTransport | null {
  const cfg = configFromEnv();
  if (!cfg) return null;
  return new SmtpTransport(cfg);
}
