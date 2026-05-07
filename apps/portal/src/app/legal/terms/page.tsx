import type { Metadata } from 'next';
import { LEGAL_VERSION, TERMS_LAST_UPDATED } from '@/lib/legal/version';
import { BRAND } from '@/lib/branding';

export const metadata: Metadata = {
  title: `Terms of Service — ${BRAND.shortName}`,
};

const LEGAL_EMAIL = `legal@${BRAND.recordsEmail.split('@')[1] ?? 'example.com'}`;

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-neutral">
      <h1>Terms of Service</h1>
      <p className="text-sm text-neutral-500">
        Version {LEGAL_VERSION} · Last updated {TERMS_LAST_UPDATED}
      </p>

      <h2>1. Eligibility</h2>
      <p>
        The portal is intended for licensed healthcare professionals
        coordinating imaging studies on behalf of patients. Patients do not
        have direct accounts.
      </p>

      <h2>2. Account responsibility</h2>
      <p>
        You are responsible for safeguarding your credentials. Do not share
        accounts. Notify the clinic immediately if you suspect compromise.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Submit only referrals you are clinically authorized to make.</li>
        <li>Provide accurate patient and clinical information.</li>
        <li>Do not attempt to access referrals not yours.</li>
        <li>Do not export bulk PHI without a documented authorization.</li>
      </ul>

      <h2>4. Service availability</h2>
      <p>
        Target uptime is 99.5% during clinic business hours, with planned
        maintenance announced in advance. The portal is not a substitute for
        emergency care channels.
      </p>

      <h2>5. Termination</h2>
      <p>
        The clinic may revoke access for violations of these Terms or HIPAA.
        Your data is preserved per HIPAA retention policy (6 years for audit
        logs).
      </p>

      <h2>6. Disclaimer</h2>
      <p>
        The portal facilitates ordering and scheduling — clinical judgment
        remains the responsibility of the referring physician. Imaging
        interpretations come from {BRAND.shortName}'s radiologists.
      </p>

      <h2>7. Governing law</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction where the
        clinic is registered, excluding its conflicts-of-law rules.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions: <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>
      </p>
    </main>
  );
}
