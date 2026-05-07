import { withRetry } from './retry.js';
import { botLog, hashEmail } from './redact.js';

export type EmailTransport = 'ses' | 'smtp-local' | 'noop';

export interface SendArgs {
  to: string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
}

const DEFAULT_FROM = 'Vendo Referrals <noreply@vendo.local>';

interface Transport {
  send: (args: SendArgs) => Promise<void>;
}

function noopTransport(): Transport {
  return {
    async send(args) {
      botLog('email_sent_noop', { to: args.to.map(hashEmail), subject: args.subject });
    },
  };
}

function smtpLocalTransport(host: string, port: number): Transport {
  return {
    async send(args) {
      // Plain SMTP via fetch is not standard; production code would use nodemailer.
      // For local dev we POST to MailHog's HTTP API where available, otherwise just log.
      const url = `http://${host}:${port + 1000}/api/v2/messages`;
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            from: args.from ?? DEFAULT_FROM,
            to: args.to,
            subject: args.subject,
            text: args.text,
            html: args.html,
          }),
        });
      } catch {
        // mailhog isn't always running in unit tests
      }
      botLog('email_sent_dev', { to: args.to.map(hashEmail), subject: args.subject });
    },
  };
}

interface SESLike {
  send: (cmd: unknown) => Promise<unknown>;
}

function sesTransport(client: SESLike, sendCommandCtor: (i: SendArgs) => unknown): Transport {
  return {
    async send(args) {
      await withRetry(() => client.send(sendCommandCtor(args)));
      botLog('email_sent_ses', { to: args.to.map(hashEmail), subject: args.subject });
    },
  };
}

let _transport: Transport | undefined;

export function setEmailTransportForTesting(t: Transport | undefined): void {
  _transport = t;
}

export function getTransport(): Transport {
  if (_transport) return _transport;
  const mode = (process.env.EMAIL_TRANSPORT as EmailTransport | undefined) ?? 'noop';
  if (mode === 'smtp-local') {
    const host = process.env.SMTP_HOST ?? 'mailhog';
    const port = Number(process.env.SMTP_PORT ?? '1025');
    _transport = smtpLocalTransport(host, port);
    return _transport;
  }
  if (mode === 'ses') {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const ses = (globalThis as Record<string, unknown>)['__VENDO_SES__'] as
      | { client: SESLike; cmd: (i: SendArgs) => unknown }
      | undefined;
    if (!ses) throw new Error('SES transport selected but client not bound — bind via setEmailTransportForTesting');
    _transport = sesTransport(ses.client, ses.cmd);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return _transport;
  }
  _transport = noopTransport();
  return _transport;
}

export async function sendEmail(args: SendArgs): Promise<void> {
  await getTransport().send({ ...args, from: args.from ?? DEFAULT_FROM });
}
