import type { Metadata } from 'next';
import { LEGAL_VERSION, PRIVACY_LAST_UPDATED } from '@/lib/legal/version';
import { BRAND } from '@/lib/branding';

export const metadata: Metadata = {
  title: `Privacy Notice — ${BRAND.shortName}`,
};

const PRIVACY_EMAIL = `privacy@${BRAND.recordsEmail.split('@')[1] ?? 'example.com'}`;

/**
 * HIPAA Notice of Privacy Practices, condensed for the referral portal.
 * Bump LEGAL_VERSION whenever material content changes — the signup
 * checkbox and audit log compare against that version.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-neutral">
      <h1>Privacy Notice</h1>
      <p className="text-sm text-neutral-500">
        Version {LEGAL_VERSION} · Last updated {PRIVACY_LAST_UPDATED}
      </p>

      <h2>1. Who we are</h2>
      <p>
        {BRAND.shortName} operates this referral portal as a HIPAA-covered
        Covered Entity. The portal is used by referring physicians and our
        clinic staff to coordinate imaging studies and reports.
      </p>

      <h2>2. What information we collect</h2>
      <ul>
        <li>Patient demographics (name, DOB, contact details).</li>
        <li>Referral details (study type, body part, indication).</li>
        <li>Insurance information you upload.</li>
        <li>Appointment, study, and report metadata.</li>
        <li>Account and session data (login times, IP, audit events).</li>
      </ul>

      <h2>3. How we use it</h2>
      <p>
        Strictly for treatment, payment, and healthcare operations as defined
        by HIPAA. We do not sell or rent PHI. We do not use PHI for marketing
        without separate written authorization.
      </p>

      <h2>4. Who we share it with</h2>
      <ul>
        <li>The treating imaging clinic and its authorized staff.</li>
        <li>The referring physician you submit on behalf of.</li>
        <li>Our subprocessors (hosting, error tracking — all under BAAs).</li>
        <li>Authorities, when required by law.</li>
      </ul>

      <h2>5. How we protect it</h2>
      <p>
        Encryption in transit (TLS) and at rest, role-based AccessPolicies,
        per-resource audit logging, and least-privilege practitioner
        identifiers. Sessions idle out after 15 minutes; absolute lifetime is
        12 hours.
      </p>

      <h2>6. Your rights</h2>
      <p>
        You may request access, correction, an accounting of disclosures, and
        a copy of records. Email <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
      </p>

      <h2>7. Breach notification</h2>
      <p>
        We will notify the clinic within 24 hours of discovering an incident
        that may affect PHI; the clinic notifies affected patients per HIPAA
        timelines.
      </p>

      <h2>8. Contact</h2>
      <p>
        Privacy Officer · {PRIVACY_EMAIL}
      </p>
    </main>
  );
}
