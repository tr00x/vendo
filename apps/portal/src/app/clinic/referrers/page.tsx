import type { Practitioner } from '@medplum/fhirtypes';
import { ROLE_SYSTEM, requireClinicStaff } from '@/lib/auth/guard';
import { ReferrersTable, type ReferrerRow } from '@/components/clinic/ReferrersTable';
import { InviteReferrerButton } from '@/components/clinic/InviteReferrerButton';
import { InfoIcon } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

function isReferrer(p: Practitioner): boolean {
  // Match guard.ts logic: tagged identifier wins; otherwise fall back to the
  // qualification text marker. Excludes anything that looks like clinic staff.
  const tag = p.identifier?.find((i) => i.system === ROLE_SYSTEM)?.value;
  if (tag === 'Referrer') return true;
  if (tag === 'ClinicStaff' || tag === 'Admin') return false;
  const practice = p.qualification?.[0]?.code?.text ?? '';
  if (!practice) return false;
  if (/Front Desk|Clinic Staff|Imaging Clinic —/i.test(practice)) return false;
  return true;
}

export default async function ReferrersPage() {
  const { medplum } = await requireClinicStaff();

  const practitioners = (await medplum.searchResources(
    'Practitioner',
    '_count=200&_sort=family',
  )) as Practitioner[];
  const referrers = practitioners.filter(isReferrer);

  // Pull referral counts in parallel. _summary=count returns a Bundle with
  // `total` populated and no entries, which is the cheapest way to count.
  const counts = await Promise.all(
    referrers.map(async (p) => {
      try {
        const bundle = await medplum.search(
          'ServiceRequest',
          `requester=Practitioner/${p.id}&_summary=count`,
        );
        return bundle.total ?? 0;
      } catch {
        return 0;
      }
    }),
  );

  const rows: ReferrerRow[] = referrers.map((practitioner, i) => ({
    practitioner,
    referralCount: counts[i] ?? 0,
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tightish text-ink">
            Referring physicians
          </h1>
          <p className="mt-1 text-[13.5px] text-smoke">
            {rows.length === 0
              ? 'No physicians have portal access yet.'
              : `${rows.length} ${rows.length === 1 ? 'physician has' : 'physicians have'} portal access.`}
          </p>
        </div>
        <InviteReferrerButton />
      </header>

      <div className="flex items-start gap-2 rounded-md border border-hairline bg-bone/60 px-3.5 py-2.5 text-[12.5px] text-graphite">
        <InfoIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-smoke" />
        <span>
          Invitations create the account and generate a one-time password.
          Email-based invites turn on once SMTP and the BAA are in place.
        </span>
      </div>

      <ReferrersTable rows={rows} />
    </div>
  );
}
