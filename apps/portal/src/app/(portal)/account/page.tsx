import { requireSession } from '@/lib/auth/guard';
import { ShieldIcon, MailIcon, PhoneIcon, UserIcon, HelpIcon } from '@/components/ui/icons';
import { ChangePasswordForm } from './ChangePasswordForm';
import { SignOutButton } from './SignOutButton';
import { BRAND } from '@/lib/branding';

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'How do I refer a patient?',
    a: 'Click "New referral" in the sidebar and follow the wizard: Schedule → Patient → Study → (MRI / Pregnancy if relevant) → Insurance → Review. Most referrals take under 90 seconds to submit.',
  },
  {
    q: 'Can I save a referral and come back to it?',
    a: 'Yes — your progress in the wizard is saved automatically in your browser. If you close the tab and come back, the form will be exactly where you left it.',
  },
  {
    q: 'What happens after I submit a referral?',
    a: 'You receive a confirmation email immediately. The clinic also gets notified and will contact your patient to confirm or schedule. You can track status anytime from the dashboard.',
  },
  {
    q: "Can I see another doctor's patients?",
    a: 'No — each physician sees only the patients they have personally referred. This is enforced at the database layer for HIPAA compliance, not just hidden in the UI.',
  },
  {
    q: 'How do I attach insurance cards or prior films?',
    a: "In the Insurance step of the wizard, drop PDF, JPG, or PNG files (up to 25 MB each, 10 files total). They're stored securely and attached to the referral.",
  },
  {
    q: 'Will the patient see anything?',
    a: "The patient receives an email when their appointment is booked, and another when imaging is complete with a link to view results. They don't log in directly.",
  },
  {
    q: 'I made a mistake. How do I cancel?',
    a: 'Open the referral detail page (click any row on the dashboard) and use the "Cancel referral" button — or call the clinic for urgent changes. Cancelled referrals notify the clinic and the patient automatically.',
  },
  {
    q: 'How do I see results / images?',
    a: 'Once imaging is complete, the referral detail page shows a "View study images" button. Click to open the imaging viewer in a new tab.',
  },
];

export default async function AccountPage() {
  const { profile } = await requireSession();
  const email = profile.telecom?.find((t) => t.system === 'email')?.value ?? '—';
  const phone = profile.telecom?.find((t) => t.system === 'phone')?.value;
  const name = profile.name?.[0]
    ? `${profile.name[0].given?.join(' ') ?? ''} ${profile.name[0].family ?? ''}`.trim()
    : '—';
  const practice = profile.qualification?.[0]?.code?.text ?? '';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
      {/* Left column — Account */}
      <div className="min-w-0">
        <div className="mb-6">
          <h1 className="text-[26px] font-semibold tracking-tightish text-ink">Account</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-smoke">
            Your profile, sign-in security, and how the clinic identifies you.
          </p>
        </div>

        {/* Profile card */}
        <section className="mb-5 rounded-md border border-hairline bg-paper">
          <div className="flex items-start gap-4 border-b border-hairline p-6">
            <div
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-bone text-[16px] font-semibold tracking-tightish text-graphite"
              aria-hidden
            >
              {initials || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[18px] font-semibold tracking-tightish text-ink">{name}</div>
              <div className="mt-0.5 text-[13.5px] text-smoke">{practice || 'Referring Physician'}</div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-smoke">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Verified physician — patients can see this name on appointment confirmations
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-y-4 p-6 sm:grid-cols-2 sm:gap-x-8">
            <ContactRow icon={MailIcon} label="Email" value={email} hint="Used to sign in and receive notifications" />
            {phone && <ContactRow icon={PhoneIcon} label="Phone" value={phone} hint="The clinic may call this number for urgent referrals" />}
            {practice && <ContactRow icon={UserIcon} label="Practice" value={practice} hint="Your referring practice or clinic affiliation" />}
          </dl>
          <div className="border-t border-hairline bg-bone px-6 py-3 text-[12px] text-smoke">
            To change any of these, contact your clinic administrator — these details flow into every referral you send.
          </div>
        </section>

        {/* Security */}
        <section className="mb-5 rounded-md border border-hairline bg-paper">
          <header className="border-b border-hairline px-6 py-4">
            <h2 className="text-[14px] font-semibold tracking-tightish text-ink">Security</h2>
            <p className="mt-0.5 text-[12.5px] text-smoke">
              How we keep your account safe — and your patients&apos; data with it.
            </p>
          </header>
          <div className="divide-y divide-hairline">
            <SecurityRow
              title="Sign-in method"
              value="Email and password"
              description="Verified each time you sign in."
              tooltip="If 5 sign-in attempts fail in a row, the account locks for 30 minutes — that's a HIPAA-style brute-force defense."
              badge={{ text: 'Active', tone: 'green' }}
            />
            <ChangePasswordForm />
            <SecurityRow
              title="Two-factor authentication"
              value="Not yet"
              description="An extra code from an authenticator app. Coming in a future release."
              tooltip="2FA adds a 6-digit code from an app like Google Authenticator on top of your password — even someone with your password can't sign in without your phone."
              badge={{ text: 'Coming soon', tone: 'amber' }}
            />
            <SecurityRow
              title="Active sessions"
              value="This device only"
              description="Sign out from this device or close all sessions."
              tooltip="Your session auto-expires after 12 hours of inactivity. Closing your browser without signing out is fine — but on a shared computer, sign out manually."
              action={<SignOutButton />}
            />
          </div>
        </section>

        {/* HIPAA notice */}
        <div className="rounded-md border border-hairline bg-paper p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
              <ShieldIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold tracking-tightish text-ink">
                Your data is HIPAA-protected
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-graphite">
                Every patient record is encrypted at rest and in transit. Every access — yours, the clinic&apos;s, ours — is audit-logged. You can only see the patients you&apos;ve personally referred; never another physician&apos;s records.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right column — Help */}
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tightish text-ink">Help &amp; support</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-smoke">
            Quick answers and a real person on the phone when you need one.
          </p>
        </div>

        <div className="rounded-md border border-hairline bg-paper px-4 py-3 text-[12.5px] leading-relaxed text-graphite">
          <strong className="block font-semibold text-ink">{BRAND.name}</strong>
          <span className="text-smoke">{BRAND.address}</span>
          <div className="mt-1 text-[11.5px] text-smoke">
            {BRAND.hours}
          </div>
        </div>

        <div className="space-y-2.5">
          <ContactCard
            icon={PhoneIcon}
            title="Call the clinic"
            value={BRAND.phone}
            subtitle={`Also ${BRAND.phoneAlt} · fastest for urgent changes`}
            href={`tel:${BRAND.phoneTel}`}
          />
          <ContactCard
            icon={MailIcon}
            title="General inquiries"
            value={BRAND.supportEmail}
            subtitle="Scheduling, paperwork, and non-urgent questions"
            href={`mailto:${BRAND.supportEmail}`}
          />
          <ContactCard
            icon={MailIcon}
            title="Medical records"
            value={BRAND.recordsEmail}
            subtitle="Request copies of imaging or reports"
            href={`mailto:${BRAND.recordsEmail}`}
          />
        </div>

        <section className="rounded-md border border-hairline bg-paper">
          <header className="border-b border-hairline px-4 py-3">
            <div className="flex items-center gap-2">
              <HelpIcon className="h-3.5 w-3.5 text-graphite" />
              <h3 className="text-[12.5px] font-semibold tracking-tightish text-ink">
                Frequently asked
              </h3>
            </div>
          </header>
          <div className="divide-y divide-hairline">
            {FAQS.map((faq) => (
              <details
                key={faq.q}
                className="group px-4 py-3 [&[open]_.faq-chevron]:rotate-180"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-[12.5px] font-medium tracking-tightish text-ink hover:text-graphite">
                  <span>{faq.q}</span>
                  <span className="faq-chevron mt-0.5 flex-shrink-0 text-smoke transition-transform">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-2 text-[12px] leading-relaxed text-graphite">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: (p: { className?: string }) => React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-microcaps text-smoke">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-1 text-[14px] font-medium tracking-tightish text-ink">{value}</dd>
      {hint && <dd className="mt-0.5 text-[11.5px] leading-snug text-smoke">{hint}</dd>}
    </div>
  );
}

function SecurityRow({
  title,
  value,
  description,
  tooltip,
  badge,
  action,
}: {
  title: string;
  value: string;
  description: string;
  tooltip?: string;
  badge?: { text: string; tone: 'green' | 'amber' };
  action?: React.ReactNode;
}) {
  const badgeCls =
    badge?.tone === 'green'
      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
      : 'bg-amber-50 text-amber-800 ring-amber-200';
  return (
    <div className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold tracking-tightish text-ink">{title}</span>
          {badge && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${badgeCls}`}
            >
              {badge.text}
            </span>
          )}
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-smoke">{description}</p>
        {tooltip && (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-graphite">
            <span className="font-medium text-ink">Why this matters: </span>
            {tooltip}
          </p>
        )}
      </div>
      <div className="flex flex-shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <div className="text-[13.5px] font-medium tracking-tightish text-graphite sm:text-right">
          {value}
        </div>
        {action}
      </div>
    </div>
  );
}

function ContactCard({
  icon: Icon,
  title,
  value,
  subtitle,
  href,
}: {
  icon: (p: { className?: string }) => React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group flex items-start gap-3 rounded-md border border-hairline bg-paper p-3 transition hover:border-ink/30 hover:bg-bone"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-bone text-graphite transition group-hover:border-ink/40 group-hover:text-ink">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10.5px] font-medium uppercase tracking-microcaps text-smoke">{title}</div>
        <div className="mt-0.5 truncate text-[13px] font-semibold tracking-tightish text-ink">
          {value}
        </div>
        <div className="mt-0.5 text-[11px] text-smoke">{subtitle}</div>
      </div>
    </a>
  );
}
