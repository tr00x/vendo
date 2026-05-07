// Phase 1.9 v1.0 minimum — brand-aligned email templates.
//
// Each template renders to {subject, text, html}. We keep both text and
// html so the recipient's client can pick (some doctors run plain-text-
// only inboxes; HTML is for the rest). The HTML is intentionally
// inline-styled because most clients strip <style>/<link>; flex/grid is
// avoided because Outlook's Word renderer chokes on them.
//
// Visual language mirrors the portal: monochrome neutrals (bone / paper /
// ink) with one #3B43E0 accent, the same "CM" logomark on a near-black
// chip, and the same Imaging & Diagnostics tagline. The brand layer
// stays in one place at the top so a future multi-clinic rollout becomes
// a per-tenant config swap, not a template fork.

import { formatDayTime } from '@/lib/format';
import { BRAND as BRAND_BASE } from '@/lib/branding';

// Brand strings come from `lib/branding.ts` (env-driven).
// Visual tokens live here because they're only consumed by the email
// renderer and would just bloat the client bundle if exported.
export const BRAND = {
  ...BRAND_BASE,
  // Portal palette — see globals.css. Kept inline so emails don't depend
  // on the running app to render.
  accent: '#3B43E0',     // --accent-rgb (light)
  ink: '#0E0E10',        // --ink (CTA chip / logo bg)
  graphite: '#3A3A40',   // body text
  smoke: '#6E6E76',      // muted / labels
  hairline: '#E4E4E7',   // dividers
  bone: '#F7F7F8',       // page bg
  paper: '#FFFFFF',      // card bg
  // Status accents — match the portal's signal-* tokens.
  signal: {
    schedBg: '#EEF0FF', schedBorder: '#D7DBFB', schedInk: '#1F2A8C',
    doneBg:  '#EEFBF1', doneBorder:  '#C7EBD1', doneInk:  '#0F6E2D',
    stopBg:  '#FDECEC', stopBorder:  '#F5C7C7', stopInk:  '#A41A1A',
    pendBg:  '#FFF6E5', pendBorder:  '#F4DDA3', pendInk:  '#7A4A05',
  },
} as const;

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

interface PatientLite {
  given: string;
  family: string;
}
interface DoctorLite {
  given: string;
  family: string;
}
interface StudyLite {
  modality: 'MRI' | 'XRAY' | 'ARK';
  bodyPart: string;
}

const MODALITY_LABEL: Record<StudyLite['modality'], string> = {
  MRI: 'MRI',
  XRAY: 'X-ray',
  ARK: 'Ultrasound',
};

function patientName(p: PatientLite): string {
  return `${p.given} ${p.family}`.trim() || 'your patient';
}
function doctorGreeting(d: DoctorLite): string {
  const last = d.family?.trim();
  return last ? `Dr. ${last}` : 'Doctor';
}
function studyLabel(s: StudyLite): string {
  return `${MODALITY_LABEL[s.modality]} — ${s.bodyPart}`;
}

// Shared HTML chrome — same header/footer for every template. The header
// is monochrome (matches the portal sidebar): "CM" chip on near-black,
// brand stack to the right, no loud color block. Body content drops into
// `inner` as already-rendered HTML.
function envelope(args: { previewText: string; heading: string; inner: string }): string {
  const { previewText, heading, inner } = args;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bone};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(previewText)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bone};">
    <tr><td align="center" style="padding:32px 16px 40px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:${BRAND.paper};border:1px solid ${BRAND.hairline};border-radius:12px;overflow:hidden;">
        <tr><td style="padding:18px 28px;border-bottom:1px solid ${BRAND.hairline};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            <td width="36" style="padding-right:10px;vertical-align:middle;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="32" height="32" align="center" valign="middle" style="background:${BRAND.ink};border-radius:7px;color:#ffffff;font-size:11.5px;font-weight:600;letter-spacing:-0.012em;line-height:32px;">${escapeHtml(BRAND.initials)}</td>
              </tr></table>
            </td>
            <td style="vertical-align:middle;">
              <div style="font-size:13.5px;font-weight:600;color:${BRAND.ink};letter-spacing:-0.012em;line-height:1.2;">${escapeHtml(BRAND.shortName)}</div>
              <div style="font-size:11px;color:${BRAND.smoke};letter-spacing:0.02em;margin-top:2px;">${escapeHtml(BRAND.tagline)}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 28px 4px;">
          <div style="font-size:11px;font-weight:600;color:${BRAND.accent};letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(heading)}</div>
        </td></tr>
        <tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6;color:${BRAND.graphite};">
          ${inner}
        </td></tr>
        <tr><td style="padding:16px 28px 22px;border-top:1px solid ${BRAND.hairline};background:${BRAND.bone};font-size:11.5px;line-height:1.55;color:${BRAND.smoke};">
          <div style="color:${BRAND.ink};font-weight:600;font-size:12px;letter-spacing:-0.005em;">${escapeHtml(BRAND.name)}</div>
          <div style="margin-top:3px;">${escapeHtml(BRAND.address)}</div>
          <div style="margin-top:6px;">
            Front desk: <a href="tel:${BRAND.phoneTel}" style="color:${BRAND.ink};text-decoration:none;font-weight:500;">${escapeHtml(BRAND.phone)}</a>
            &nbsp;·&nbsp;
            <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.ink};text-decoration:none;font-weight:500;">${escapeHtml(BRAND.supportEmail)}</a>
          </div>
          <div style="margin-top:3px;color:#94a3b8;">${escapeHtml(BRAND.hours)}</div>
        </td></tr>
      </table>
      <div style="margin-top:14px;font-size:11px;color:${BRAND.smoke};max-width:540px;line-height:1.5;">
        Sent because you have an account on the ${escapeHtml(BRAND.shortName)} referral portal. Reply to this email or call the number above with any questions.
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ctaButton(href: string, label: string, variant: 'primary' | 'ghost' = 'primary'): string {
  const bg = variant === 'primary' ? BRAND.ink : BRAND.paper;
  const color = variant === 'primary' ? '#ffffff' : BRAND.ink;
  const border = variant === 'primary' ? BRAND.ink : BRAND.hairline;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 8px;"><tr><td style="background:${bg};border:1px solid ${border};border-radius:8px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 22px;color:${color};font-weight:600;font-size:14px;text-decoration:none;letter-spacing:-0.005em;">${escapeHtml(label)} &rarr;</a>
  </td></tr></table>`;
}

function infoCard(rows: Array<[string, string]>, tone: 'neutral' | 'sched' | 'done' | 'stop' | 'pend' = 'neutral'): string {
  const palette = {
    neutral: { bg: BRAND.bone,           border: BRAND.hairline,           ink: BRAND.ink },
    sched:   { bg: BRAND.signal.schedBg, border: BRAND.signal.schedBorder, ink: BRAND.signal.schedInk },
    done:    { bg: BRAND.signal.doneBg,  border: BRAND.signal.doneBorder,  ink: BRAND.signal.doneInk  },
    stop:    { bg: BRAND.signal.stopBg,  border: BRAND.signal.stopBorder,  ink: BRAND.signal.stopInk  },
    pend:    { bg: BRAND.signal.pendBg,  border: BRAND.signal.pendBorder,  ink: BRAND.signal.pendInk  },
  }[tone];
  const cells = rows
    .map(
      ([k, v]) => `<tr>
        <td style="padding:7px 0;color:${BRAND.smoke};font-size:12px;width:100px;letter-spacing:0.01em;">${escapeHtml(k)}</td>
        <td style="padding:7px 0;color:${palette.ink};font-size:14px;font-weight:500;">${escapeHtml(v)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 4px;background:${palette.bg};border:1px solid ${palette.border};border-radius:10px;padding:14px 18px;">
    ${cells}
  </table>`;
}

function credentialsCard(email: string, password: string): string {
  // Fixed-width chip for the password. Email clients strip background-image
  // gradients and many strip background-color on inline elements that
  // aren't <td>; keeping it on a <td> guarantees consistent rendering.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 4px;background:${BRAND.bone};border:1px solid ${BRAND.hairline};border-radius:10px;padding:14px 18px;">
    <tr>
      <td style="padding:7px 0;color:${BRAND.smoke};font-size:12px;width:100px;letter-spacing:0.01em;">Email</td>
      <td style="padding:7px 0;color:${BRAND.ink};font-size:14px;font-weight:500;font-family:'SF Mono',Menlo,Consolas,monospace;">${escapeHtml(email)}</td>
    </tr>
    <tr>
      <td style="padding:7px 0;color:${BRAND.smoke};font-size:12px;width:100px;letter-spacing:0.01em;">Password</td>
      <td style="padding:7px 0;color:${BRAND.ink};font-size:14px;font-weight:600;font-family:'SF Mono',Menlo,Consolas,monospace;letter-spacing:0.01em;">${escapeHtml(password)}</td>
    </tr>
  </table>`;
}

// ──────────────────────────────────────────────────────────────────────
// Templates
// ──────────────────────────────────────────────────────────────────────

export interface ScheduledArgs {
  doctor: DoctorLite;
  patient: PatientLite;
  study: StudyLite;
  startIso: string;
  serviceRequestId: string;
}

export function scheduledTemplate(args: ScheduledArgs): EmailContent {
  const when = formatDayTime(args.startIso);
  const subject = `Imaging scheduled — ${patientName(args.patient)}, ${when}`;
  const link = `${BRAND.portalUrl}/refer/${args.serviceRequestId}`;
  const text = `Hi ${doctorGreeting(args.doctor)},

We've scheduled imaging for ${patientName(args.patient)}.

  Study:    ${studyLabel(args.study)}
  When:     ${when}
  Location: ${BRAND.address}

The patient will receive a separate confirmation. If anything needs to change, please call ${BRAND.phone} or open the referral:
${link}

— ${BRAND.shortName}`;
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(doctorGreeting(args.doctor))},</p>
    <p style="margin:0 0 14px;">We've scheduled imaging for <strong style="color:${BRAND.ink};">${escapeHtml(patientName(args.patient))}</strong>. The patient will receive a separate confirmation.</p>
    ${infoCard(
      [
        ['Study', studyLabel(args.study)],
        ['When', when],
        ['Location', BRAND.address],
      ],
      'sched',
    )}
    ${ctaButton(link, 'Open referral')}
    <p style="margin:6px 0 0;color:${BRAND.smoke};font-size:13px;">Need to change anything? Call <a href="tel:${BRAND.phoneTel}" style="color:${BRAND.ink};text-decoration:none;font-weight:500;">${escapeHtml(BRAND.phone)}</a> or reply to this email.</p>
  `;
  return { subject, text, html: envelope({ previewText: `Imaging confirmed for ${when}`, heading: 'Imaging scheduled', inner }) };
}

export interface RescheduledArgs extends ScheduledArgs {
  previousStartIso: string | undefined;
  reason: string;
}

export function rescheduledTemplate(args: RescheduledArgs): EmailContent {
  const newWhen = formatDayTime(args.startIso);
  const oldWhen = args.previousStartIso ? formatDayTime(args.previousStartIso) : 'a previously booked time';
  const subject = `Rescheduled — ${patientName(args.patient)}, now ${newWhen}`;
  const link = `${BRAND.portalUrl}/refer/${args.serviceRequestId}`;
  const text = `Hi ${doctorGreeting(args.doctor)},

We've moved imaging for ${patientName(args.patient)}.

  Study:    ${studyLabel(args.study)}
  Was:      ${oldWhen}
  Now:      ${newWhen}
  Reason:   ${args.reason}

The patient will receive a separate confirmation. View the referral:
${link}

— ${BRAND.shortName}`;
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(doctorGreeting(args.doctor))},</p>
    <p style="margin:0 0 14px;">We've moved imaging for <strong style="color:${BRAND.ink};">${escapeHtml(patientName(args.patient))}</strong>. The patient will receive a separate confirmation.</p>
    ${infoCard(
      [
        ['Study', studyLabel(args.study)],
        ['Was', oldWhen],
        ['Now', newWhen],
        ['Reason', args.reason],
      ],
      'sched',
    )}
    ${ctaButton(link, 'Open referral')}
  `;
  return { subject, text, html: envelope({ previewText: `Now ${newWhen}`, heading: 'Appointment rescheduled', inner }) };
}

export interface CancelledArgs {
  doctor: DoctorLite;
  patient: PatientLite;
  study: StudyLite;
  reason: string;
  cancelledBy: 'clinic' | 'referrer';
  serviceRequestId: string;
}

export function cancelledTemplate(args: CancelledArgs): EmailContent {
  const who = args.cancelledBy === 'clinic' ? 'the clinic' : 'the referring office';
  const subject = `Referral cancelled — ${patientName(args.patient)}`;
  const link = `${BRAND.portalUrl}/refer/${args.serviceRequestId}`;
  const text = `Hi ${doctorGreeting(args.doctor)},

The referral for ${patientName(args.patient)} has been cancelled by ${who}.

  Study:   ${studyLabel(args.study)}
  Reason:  ${args.reason}

If this was a mistake, please call ${BRAND.phone} as soon as possible — slots open back up immediately and we may still be able to fit the patient in. Otherwise no further action is required from you.

View the referral:
${link}

— ${BRAND.shortName}`;
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(doctorGreeting(args.doctor))},</p>
    <p style="margin:0 0 14px;">The referral for <strong style="color:${BRAND.ink};">${escapeHtml(patientName(args.patient))}</strong> has been cancelled by ${escapeHtml(who)}.</p>
    ${infoCard(
      [
        ['Study', studyLabel(args.study)],
        ['Reason', args.reason],
      ],
      'stop',
    )}
    <p style="margin:14px 0 4px;font-size:14px;">If this was a mistake, please call <a href="tel:${BRAND.phoneTel}" style="color:${BRAND.ink};font-weight:600;text-decoration:none;">${escapeHtml(BRAND.phone)}</a> right away — we may still be able to fit the patient in.</p>
    ${ctaButton(link, 'Open referral', 'ghost')}
  `;
  return { subject, text, html: envelope({ previewText: `Cancelled — ${args.reason.slice(0, 80)}`, heading: 'Referral cancelled', inner }) };
}

export interface CompletedArgs {
  doctor: DoctorLite;
  patient: PatientLite;
  study: StudyLite;
  pacsLink: string | undefined;
  serviceRequestId: string;
}

export function completedTemplate(args: CompletedArgs): EmailContent {
  const subject = `Imaging done — ${patientName(args.patient)}, ${MODALITY_LABEL[args.study.modality]}`;
  const link = `${BRAND.portalUrl}/refer/${args.serviceRequestId}`;
  const text = `Hi ${doctorGreeting(args.doctor)},

Imaging is complete for ${patientName(args.patient)} (${studyLabel(args.study)}).

${args.pacsLink ? `View the study: ${args.pacsLink}\n\n` : ''}The official report will follow shortly. Open the referral:
${link}

— ${BRAND.shortName}`;
  const pacsBlock = args.pacsLink
    ? `<p style="margin:14px 0 0;"><a href="${escapeHtml(args.pacsLink)}" style="color:${BRAND.accent};font-weight:600;text-decoration:none;">View the study images &rarr;</a></p>`
    : '';
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(doctorGreeting(args.doctor))},</p>
    <p style="margin:0 0 14px;">Imaging is complete for <strong style="color:${BRAND.ink};">${escapeHtml(patientName(args.patient))}</strong>. The official report will follow shortly.</p>
    ${infoCard(
      [
        ['Study', studyLabel(args.study)],
        ['Status', 'Imaging captured · awaiting report'],
      ],
      'done',
    )}
    ${pacsBlock}
    ${ctaButton(link, 'Open referral')}
  `;
  return { subject, text, html: envelope({ previewText: 'Imaging complete — report to follow', heading: 'Imaging complete', inner }) };
}

export interface NoShowArgs {
  doctor: DoctorLite;
  patient: PatientLite;
  study: StudyLite;
  appointmentStartIso: string | undefined;
  serviceRequestId: string;
}

export function noShowTemplate(args: NoShowArgs): EmailContent {
  const when = args.appointmentStartIso ? formatDayTime(args.appointmentStartIso) : 'their scheduled time';
  const subject = `Patient didn't arrive — ${patientName(args.patient)}`;
  const link = `${BRAND.portalUrl}/refer/${args.serviceRequestId}`;
  const text = `Hi ${doctorGreeting(args.doctor)},

${patientName(args.patient)} did not show up for ${when}. The slot has been freed.

  Study: ${studyLabel(args.study)}

Please reach the patient at your end and let us know whether to rebook or close the referral. You can do either from the referral page:
${link}

If you'd like the front desk to try them again, call ${BRAND.phone}.

— ${BRAND.shortName}`;
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(doctorGreeting(args.doctor))},</p>
    <p style="margin:0 0 14px;"><strong style="color:${BRAND.ink};">${escapeHtml(patientName(args.patient))}</strong> did not show up for ${escapeHtml(when)}. The slot has been freed.</p>
    ${infoCard(
      [
        ['Study', studyLabel(args.study)],
        ['Missed', when],
      ],
      'pend',
    )}
    <p style="margin:14px 0 4px;font-size:14px;">Please reach the patient and let us know whether to rebook or close the referral.</p>
    ${ctaButton(link, 'Open referral')}
    <p style="margin:6px 0 0;color:${BRAND.smoke};font-size:13px;">Or have the front desk try them again — call <a href="tel:${BRAND.phoneTel}" style="color:${BRAND.ink};text-decoration:none;font-weight:500;">${escapeHtml(BRAND.phone)}</a>.</p>
  `;
  return { subject, text, html: envelope({ previewText: `No-show for ${when} — slot freed`, heading: 'Patient did not show', inner }) };
}

// ──────────────────────────────────────────────────────────────────────
// Account-lifecycle templates (welcome / password reset)
// ──────────────────────────────────────────────────────────────────────

export interface WelcomeReferrerArgs {
  doctor: DoctorLite;
  email: string;
  password: string;
  invitedByName: string | undefined; // e.g. "Jane Doe" (front-desk staff)
}

/** Sent right after a ClinicStaff invites a new referrer through the portal.
 *  The invite endpoint sets `sendEmail: false` to keep Medplum out of the
 *  outbound mail loop, so this is the only email the referrer receives. */
export function welcomeReferrerTemplate(args: WelcomeReferrerArgs): EmailContent {
  const subject = `Welcome to ${BRAND.shortName} — your referral portal access`;
  const link = `${BRAND.portalUrl}/login`;
  const inviter = args.invitedByName ? `${args.invitedByName} at ${BRAND.shortName}` : BRAND.shortName;
  const greeting = doctorGreeting(args.doctor);
  const text = `Hi ${greeting},

${inviter} has set up an account for you on the ${BRAND.shortName} referral portal. From there you can submit imaging referrals (MRI, X-ray, ultrasound), check scheduling, and follow each patient through to the final report.

  Sign in:    ${link}
  Email:      ${args.email}
  Password:   ${args.password}

Please change your password from the Account menu after your first sign-in.

If you weren't expecting this email, just ignore it or call us at ${BRAND.phone}.

— ${BRAND.shortName}`;
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(greeting)},</p>
    <p style="margin:0 0 14px;"><strong style="color:${BRAND.ink};">${escapeHtml(inviter)}</strong> has set up an account for you on our referral portal. From here you can submit imaging referrals, check scheduling, and follow each patient through to the final report.</p>
    ${credentialsCard(args.email, args.password)}
    ${ctaButton(link, 'Sign in to the portal')}
    <p style="margin:10px 0 4px;color:${BRAND.smoke};font-size:13px;">Please change your password from the Account menu after your first sign-in.</p>
    <p style="margin:4px 0 0;color:${BRAND.smoke};font-size:13px;">Not expecting this? Just ignore the email — or call us at <a href="tel:${BRAND.phoneTel}" style="color:${BRAND.ink};text-decoration:none;font-weight:500;">${escapeHtml(BRAND.phone)}</a>.</p>
  `;
  return {
    subject,
    text,
    html: envelope({ previewText: `Your sign-in details for the ${BRAND.shortName} portal`, heading: 'Welcome aboard', inner }),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Magic-link template — sent by ClinicStaff or self-service. The link
// is the credential; clicking it signs the recipient into the portal
// and rotates their underlying password (see lib/auth/magic-link.ts for
// the full threat model). We render an explicit expiry so the
// recipient knows the window is short.
// ──────────────────────────────────────────────────────────────────────

export interface MagicLinkArgs {
  doctor: DoctorLite;
  email: string;
  /** The full URL — e.g. https://portal.example.com/api/auth/magic/verify?token=… */
  url: string;
  /** Absolute expiry timestamp, formatted ("3:42 PM"). */
  expiresLabel: string;
  /** When set, the email frames the link as a staff-initiated send.
   *  When undefined, copy reads as self-service (recipient asked for it). */
  sentByName: string | undefined;
}

export function magicLinkTemplate(args: MagicLinkArgs): EmailContent {
  const greeting = doctorGreeting(args.doctor);
  const subject = `Your sign-in link for the ${BRAND.shortName} portal`;
  const opener = args.sentByName
    ? `${args.sentByName} at ${BRAND.shortName} sent you a one-tap sign-in link for the referral portal.`
    : `Here's your one-tap sign-in link for the ${BRAND.shortName} referral portal.`;
  const text = `Hi ${greeting},

${opener}

Sign in:  ${args.url}

This link expires at ${args.expiresLabel} and can only be used once. If you don't recognise this email, please ignore it or call ${BRAND.phone}.

— ${BRAND.shortName}`;
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(greeting)},</p>
    <p style="margin:0 0 14px;">${escapeHtml(opener)}</p>
    ${ctaButton(args.url, 'Sign in to the portal')}
    <p style="margin:8px 0 4px;color:${BRAND.smoke};font-size:13px;">
      This link expires at <strong style="color:${BRAND.ink};font-weight:600;">${escapeHtml(args.expiresLabel)}</strong> and can only be used once.
    </p>
    <p style="margin:6px 0 0;color:${BRAND.smoke};font-size:13px;">
      Didn't request this? Just ignore the email — or call us at <a href="tel:${BRAND.phoneTel}" style="color:${BRAND.ink};text-decoration:none;font-weight:500;">${escapeHtml(BRAND.phone)}</a>.
    </p>
  `;
  return {
    subject,
    text,
    html: envelope({
      previewText: `One-tap sign-in — expires at ${args.expiresLabel}`,
      heading: 'Your sign-in link',
      inner,
    }),
  };
}

export interface PasswordResetArgs {
  doctor: DoctorLite;
  email: string;
  password: string;
  resetByName: string | undefined; // e.g. "Jane Doe"
}

/** Sent after a ClinicStaff resets a referrer's password from the portal.
 *  Passwords are out-of-band per HIPAA — the recipient is told a reset
 *  happened, but the *new* password is also delivered here because it's
 *  set by staff rather than self-service. */
export function passwordResetTemplate(args: PasswordResetArgs): EmailContent {
  const subject = `Your ${BRAND.shortName} portal password was reset`;
  const link = `${BRAND.portalUrl}/login`;
  const by = args.resetByName ? `${args.resetByName} at ${BRAND.shortName}` : `${BRAND.shortName} staff`;
  const greeting = doctorGreeting(args.doctor);
  const text = `Hi ${greeting},

${by} has reset your password on the ${BRAND.shortName} referral portal. Use the new credentials below to sign in, then change the password from the Account menu.

  Sign in:    ${link}
  Email:      ${args.email}
  Password:   ${args.password}

If you didn't request this reset, please call us right away at ${BRAND.phone}.

— ${BRAND.shortName}`;
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(greeting)},</p>
    <p style="margin:0 0 14px;"><strong style="color:${BRAND.ink};">${escapeHtml(by)}</strong> has reset your password. Use the new credentials below to sign in, then change the password from the Account menu.</p>
    ${credentialsCard(args.email, args.password)}
    ${ctaButton(link, 'Sign in to the portal')}
    <p style="margin:10px 0 4px;color:${BRAND.smoke};font-size:13px;">Didn't request this? Call us right away at <a href="tel:${BRAND.phoneTel}" style="color:${BRAND.ink};text-decoration:none;font-weight:500;">${escapeHtml(BRAND.phone)}</a>.</p>
  `;
  return {
    subject,
    text,
    html: envelope({ previewText: 'Your portal password has been reset', heading: 'Password reset', inner }),
  };
}
