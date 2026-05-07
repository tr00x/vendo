import type { Practitioner } from '@medplum/fhirtypes';
import { MailIcon, PhoneIcon, StethoscopeIcon } from '@/components/ui/icons';
import { ReferrerRowActions } from './ReferrerRowActions';

export interface ReferrerRow {
  practitioner: Practitioner;
  referralCount: number;
}

function fullName(p: Practitioner): string {
  const n = p.name?.[0];
  if (!n) return p.telecom?.find((t) => t.system === 'email')?.value ?? 'Unknown';
  const given = (n.given ?? []).join(' ').trim();
  const family = n.family?.trim() ?? '';
  const composed = `${given} ${family}`.trim();
  return composed.length > 0 ? `Dr ${composed}` : 'Unknown';
}

function emailOf(p: Practitioner): string | undefined {
  return p.telecom?.find((t) => t.system === 'email')?.value;
}

function phoneOf(p: Practitioner): string | undefined {
  return p.telecom?.find((t) => t.system === 'phone')?.value;
}

function practiceOf(p: Practitioner): string | undefined {
  return p.qualification?.[0]?.code?.text;
}

function created(p: Practitioner): string {
  const ts = p.meta?.lastUpdated;
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ReferrersTable({ rows }: { rows: ReferrerRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <StethoscopeIcon className="h-7 w-7 text-smoke" />
        <div>
          <h2 className="text-[15px] font-semibold text-ink">No referrers yet</h2>
          <p className="mt-1 max-w-sm text-[13px] text-smoke">
            Invite a referring physician to give them portal access. They’ll be able to submit
            referrals and follow each patient through scheduling and completion.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-visible">
      <table className="w-full text-left text-[13px]">
        <thead className="border-b border-hairline bg-bone text-[11.5px] font-semibold uppercase tracking-wide text-smoke">
          <tr>
            <th scope="col" className="px-4 py-2.5">Name</th>
            <th scope="col" className="px-4 py-2.5">Practice</th>
            <th scope="col" className="px-4 py-2.5">Contact</th>
            <th scope="col" className="px-4 py-2.5 text-right">Referrals</th>
            <th scope="col" className="px-4 py-2.5 text-right">Added</th>
            <th scope="col" className="px-4 py-2.5 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map(({ practitioner, referralCount }) => {
            const email = emailOf(practitioner);
            const phone = phoneOf(practitioner);
            const isActive = practitioner.active !== false;
            const initial = {
              firstName: (practitioner.name?.[0]?.given ?? []).join(' ').trim(),
              lastName: practitioner.name?.[0]?.family?.trim() ?? '',
              phone: phone ?? '',
              practice: practiceOf(practitioner) ?? '',
            };
            return (
              <tr
                key={practitioner.id}
                className={`hover:bg-bone/60 ${isActive ? '' : 'bg-bone/40 text-smoke'}`}
              >
                <td className="px-4 py-3 font-medium text-ink">
                  <div className="flex items-center gap-2">
                    <span className={isActive ? '' : 'text-smoke line-through decoration-1'}>
                      {fullName(practitioner)}
                    </span>
                    {!isActive && (
                      <span className="inline-flex items-center rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-smoke">
                        Inactive
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-graphite">{practiceOf(practitioner) ?? '—'}</td>
                <td className="px-4 py-3 text-graphite">
                  <div className="flex flex-col gap-0.5">
                    {email && (
                      <span className="inline-flex items-center gap-1.5">
                        <MailIcon className="h-3.5 w-3.5 text-smoke" />
                        <a className="hover:underline" href={`mailto:${email}`}>{email}</a>
                      </span>
                    )}
                    {phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <PhoneIcon className="h-3.5 w-3.5 text-smoke" />
                        <a className="hover:underline" href={`tel:${phone}`}>{phone}</a>
                      </span>
                    )}
                    {!email && !phone && <span className="text-smoke">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular text-ink">{referralCount}</td>
                <td className="px-4 py-3 text-right text-graphite">{created(practitioner)}</td>
                <td className="px-4 py-3 text-right">
                  {practitioner.id && (
                    <ReferrerRowActions
                      practitionerId={practitioner.id}
                      active={isActive}
                      fullName={fullName(practitioner)}
                      email={email}
                      initial={initial}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
