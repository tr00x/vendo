import type { Patient } from '@medplum/fhirtypes';
import { ageFromDOB, patientInitials } from '@/lib/format';

export function PatientAvatar({ patient, size = 'md' }: { patient?: Patient | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const family = patient?.name?.[0]?.family ?? '';
  const given = patient?.name?.[0]?.given?.[0] ?? '';
  const initials = patientInitials(family, given);

  const dims =
    size === 'sm' ? 'h-8 w-8 text-[11px]' :
    size === 'lg' ? 'h-12 w-12 text-base' :
    'h-9 w-9 text-[12px]';

  return (
    <div
      className={`flex ${dims} flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-hairline/40 font-semibold text-graphite dark:bg-paper`}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function PatientCell({ patient }: { patient?: Patient | undefined }) {
  const family = patient?.name?.[0]?.family ?? '';
  const given = patient?.name?.[0]?.given?.[0] ?? '';
  const name = `${given} ${family}`.trim() || 'Unknown patient';
  const age = ageFromDOB(patient?.birthDate);
  const sex = patient?.gender;

  // Two readable lines: "Name" and "Age · Sex · DOB"
  const ageLabel = age != null ? `${age} y.o.` : null;
  const sexLabel = sex && sex !== 'unknown' ? sex.charAt(0).toUpperCase() + sex.slice(1) : null;
  const dobLabel = patient?.birthDate ? `Born ${patient.birthDate}` : null;
  const subline = [ageLabel, sexLabel, dobLabel].filter(Boolean).join(' · ');

  return (
    <div className="min-w-0">
      <div className="truncate text-[14px] font-medium tracking-tightish text-ink" title={name}>
        {name}
      </div>
      {subline && (
        <div className="truncate text-[12px] text-smoke tabular" title={subline}>
          {subline}
        </div>
      )}
    </div>
  );
}
