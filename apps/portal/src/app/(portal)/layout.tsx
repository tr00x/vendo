import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guard';
import { Shell } from '@/components/shell/Shell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, medplum, role, session } = await requireSession();
  // Clinic staff and admins live on the /clinic/* surface — bounce them off
  // the referrer dashboard so they don't see "Your referrals" (admin has no
  // own referrals; staff isn't a referrer).
  if (role === 'ClinicStaff' || role === 'Admin') redirect('/clinic/inbox');

  const fullName =
    profile.name?.[0]?.given && profile.name?.[0]?.family
      ? `${profile.name[0].given.join(' ')} ${profile.name[0].family}`
      : profile.telecom?.find((t) => t.system === 'email')?.value ?? 'Doctor';

  const email = profile.telecom?.find((t) => t.system === 'email')?.value ?? '';
  const practice = profile.qualification?.[0]?.code?.text ?? '';

  // Pull a quick count of pending referrals for the bell badge.
  let pendingCount = 0;
  try {
    const results = await medplum.searchResources('ServiceRequest', 'status=active&_count=200');
    pendingCount = results.length;
  } catch {
    pendingCount = 0;
  }

  return (
    <Shell
      userName={fullName}
      userEmail={email}
      userPractice={practice}
      pendingCount={pendingCount}
      sessionExpiresAt={session.expiresAt ?? null}
    >
      {children}
    </Shell>
  );
}
