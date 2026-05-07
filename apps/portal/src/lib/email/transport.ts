import { log } from '@/lib/log';
import type { EmailContent } from './templates';
import { trySmtpTransportFromEnv } from './smtp';

// Phase 1.9 v1.0 — provider-agnostic email layer. The transport is the
// only thing a real SMTP integration has to swap; templates and the
// notify() callers never change. For v1.0 the default is a stub that
// logs the rendered subject + text and returns success — no actual
// email goes out, but the rendered content is captured so a postmortem
// can recover what *would* have been sent.

export interface OutboundEmail {
  to: string;
  toName?: string;
  replyTo?: string;
  content: EmailContent;
}

export interface SendResult {
  ok: boolean;
  /** Set when the transport accepted the message (e.g. provider message id). */
  id?: string;
  /** Set on failure — short, safe-to-log reason. */
  error?: string;
}

export interface EmailTransport {
  readonly name: string;
  send(msg: OutboundEmail): Promise<SendResult>;
}

/**
 * StubTransport — the v1.0 default. Logs the rendered email at INFO so
 * the local journalctl/docker logs hold a copy of every notification
 * the system tried to send. Never throws; always returns ok:true so the
 * notify() caller doesn't end up retrying or surfacing errors to the
 * clinical action that triggered it.
 *
 * To swap in a real provider (Postmark / SES / Resend), implement
 * EmailTransport and set EMAIL_TRANSPORT to the matching factory in
 * `pickTransport()` below. The signature deliberately exposes nothing
 * about the underlying SDK so callers stay decoupled.
 */
export class StubTransport implements EmailTransport {
  readonly name = 'stub';

  async send(msg: OutboundEmail): Promise<SendResult> {
    log.info('email_stub_send', {
      to: msg.to,
      subject: msg.content.subject,
      // Truncate to keep journalctl lines bounded; full text already in
      // AuditEvent if the caller wired auditLog through.
      preview: msg.content.text.slice(0, 240),
    });
    return { ok: true, id: `stub-${Date.now()}` };
  }
}

let cached: EmailTransport | undefined;

/**
 * Pick the active transport once per process. Honors EMAIL_TRANSPORT env
 * for a forced override; otherwise auto-selects based on which provider
 * env vars are set. v1.0 only ships the stub — adding a real provider
 * requires (a) implementing EmailTransport and (b) wiring it into the
 * `select` switch below. The caller never sees this.
 */
export function getEmailTransport(): EmailTransport {
  if (cached) return cached;
  const select = (process.env.EMAIL_TRANSPORT ?? '').toLowerCase();
  // Selection order:
  //   1. Explicit EMAIL_TRANSPORT=stub|smtp wins.
  //   2. SMTP_HOST present → auto-pick SMTP (covers dev MailHog and any
  //      provider that exposes SMTP — Postmark/SES/Mailgun/Resend all do).
  //   3. Fall back to stub so dev without env still boots cleanly.
  // Real-provider SDK transports (Postmark API, SES API) can be added as
  // explicit cases later if their SMTP fronts ever prove insufficient.
  if (select === 'stub') {
    cached = new StubTransport();
    return cached;
  }
  if (select === 'smtp' || (!select && process.env.SMTP_HOST)) {
    // smtp.ts is marked `server-only`; this static import is fine in the
    // server runtime and tree-shaken out of edge/browser bundles by Next.
    const smtp = trySmtpTransportFromEnv();
    if (smtp) {
      cached = smtp;
      return cached;
    }
  }
  cached = new StubTransport();
  return cached;
}

// Test helper — lets a unit test inject a recording transport and assert
// rendered subject/body without booting a real SMTP. Production code
// should never call this.
export function _setEmailTransportForTest(t: EmailTransport | undefined): void {
  cached = t;
}
