import { requireClinicStaff } from '@/lib/auth/guard';
import { ClinicShell } from '@/components/clinic/ClinicShell';
import { BRAND } from '@/lib/branding';

export default async function ClinicLayout({ children }: { children: React.ReactNode }) {
  const { profile, medplum, session } = await requireClinicStaff();

  const fullName =
    profile.name?.[0]?.given && profile.name?.[0]?.family
      ? `${profile.name[0].given.join(' ')} ${profile.name[0].family}`
      : profile.telecom?.find((t) => t.system === 'email')?.value ?? 'Staff';
  const email = profile.telecom?.find((t) => t.system === 'email')?.value ?? '';
  const practice = profile.qualification?.[0]?.code?.text ?? BRAND.shortName;

  // Pending count for the bell
  let pendingCount = 0;
  try {
    const results = await medplum.searchResources('ServiceRequest', 'status=active&_count=200');
    pendingCount = results.length;
  } catch {
    pendingCount = 0;
  }

  return (
    <ClinicShell userName={fullName} userEmail={email} userPractice={practice} pendingCount={pendingCount} sessionExpiresAt={session.expiresAt ?? null}>
      {children}
    </ClinicShell>
  );
}
