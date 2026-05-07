/**
 * Plain-HTML email templates. React Email is not used here to keep bots
 * dependency-light. Each template returns { subject, html, text }.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function newReferralEmail(args: { referrerName: string; modality: string; patientFirst: string }): RenderedEmail {
  const subject = `New referral submitted — ${args.modality}`;
  const text = `${args.referrerName} submitted a new ${args.modality} referral for ${args.patientFirst}.`;
  const html = `<p>${esc(args.referrerName)} submitted a new <strong>${esc(args.modality)}</strong> referral.</p>`;
  return { subject, html, text };
}

export function apptBookedEmail(args: { modality: string; start: string }): RenderedEmail {
  return {
    subject: `Appointment booked — ${args.modality}`,
    text: `Your ${args.modality} appointment is booked for ${args.start}.`,
    html: `<p>Your <strong>${esc(args.modality)}</strong> appointment is booked for <strong>${esc(args.start)}</strong>.</p>`,
  };
}

export function apptCancelledEmail(args: { modality: string; start: string }): RenderedEmail {
  return {
    subject: `Appointment cancelled — ${args.modality}`,
    text: `Your ${args.modality} appointment on ${args.start} has been cancelled.`,
    html: `<p>Your <strong>${esc(args.modality)}</strong> appointment on ${esc(args.start)} has been cancelled.</p>`,
  };
}

export function imagesReadyEmail(args: { modality: string; deeplink: string }): RenderedEmail {
  return {
    subject: `Images ready — ${args.modality}`,
    text: `Images for the ${args.modality} study are ready: ${args.deeplink}`,
    html: `<p>Images for the <strong>${esc(args.modality)}</strong> study are ready.</p><p><a href="${args.deeplink}">View images</a></p>`,
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
