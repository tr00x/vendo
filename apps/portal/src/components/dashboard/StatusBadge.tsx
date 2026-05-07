import type { ServiceRequest } from '@medplum/fhirtypes';
import type { Stage } from '@/lib/stage';

interface Meta {
  label: string;
  hint: string;
  bg: string;
  fg: string;
  ring: string;
  dot: string;
}

// Stage-driven (vendo lifecycle) — the truer signal for the user.
// Each stage maps to a distinct visual so the pill changes as the referral
// progresses, instead of staying "Pending" through 4 different real states.
const STAGE_META: Record<Stage, Meta> = {
  submitted: {
    label: 'New',
    hint: 'Just submitted — clinic has not started yet.',
    bg: 'bg-amber-50 dark:bg-amber-500/15',
    fg: 'text-amber-800 dark:text-amber-300',
    ring: 'ring-amber-200 dark:ring-amber-500/30',
    dot: 'bg-amber-500',
  },
  triaged: {
    label: 'In triage',
    hint: 'Clinic is checking insurance and reaching the patient.',
    bg: 'bg-sky-50 dark:bg-sky-500/15',
    fg: 'text-sky-800 dark:text-sky-300',
    ring: 'ring-sky-200 dark:ring-sky-500/30',
    dot: 'bg-sky-500',
  },
  scheduled: {
    label: 'Scheduled',
    hint: 'Patient has a confirmed appointment.',
    bg: 'bg-accent/10',
    fg: 'text-accent',
    ring: 'ring-accent/30',
    dot: 'bg-accent',
  },
  completed: {
    label: 'Imaging done',
    hint: 'Images taken — waiting for the report.',
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    fg: 'text-emerald-800 dark:text-emerald-300',
    ring: 'ring-emerald-200 dark:ring-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  closed: {
    label: 'Closed',
    hint: 'Referral fully closed (delivered or cancelled).',
    bg: 'bg-zinc-100 dark:bg-zinc-500/20',
    fg: 'text-zinc-700 dark:text-zinc-300',
    ring: 'ring-zinc-200 dark:ring-zinc-500/30',
    dot: 'bg-zinc-400',
  },
};

// Fallback path when the caller passes raw FHIR status (e.g. on-hold which
// has no stage equivalent). Kept for the masthead pill on detail pages.
const STATUS_META: Record<string, Meta> = {
  active: {
    label: 'Pending',
    hint: 'Patient still needs an appointment.',
    bg: 'bg-amber-50 dark:bg-amber-500/15',
    fg: 'text-amber-800 dark:text-amber-300',
    ring: 'ring-amber-200 dark:ring-amber-500/30',
    dot: 'bg-amber-500',
  },
  completed: {
    label: 'Completed',
    hint: 'Imaging is done.',
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    fg: 'text-emerald-800 dark:text-emerald-300',
    ring: 'ring-emerald-200 dark:ring-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  revoked: {
    label: 'Cancelled',
    hint: 'This referral was cancelled.',
    bg: 'bg-zinc-100 dark:bg-zinc-500/20',
    fg: 'text-zinc-700 dark:text-zinc-300',
    ring: 'ring-zinc-200 dark:ring-zinc-500/30',
    dot: 'bg-zinc-400',
  },
  'on-hold': {
    label: 'On hold',
    hint: 'Referral paused — needs a decision.',
    bg: 'bg-rose-50 dark:bg-rose-500/15',
    fg: 'text-rose-800 dark:text-rose-300',
    ring: 'ring-rose-200 dark:ring-rose-500/30',
    dot: 'bg-rose-500',
  },
};

interface Props {
  /** Raw FHIR status. Pass when there's no stage available (e.g. on-hold). */
  status?: ServiceRequest['status'];
  /** Vendo lifecycle stage. When provided, takes precedence over `status`
   *  for label/color. Use this in lists and tables for proper stage signal. */
  stage?: Stage;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, stage, size = 'sm' }: Props) {
  // Stage takes precedence — it's the more granular truth. Fall back to FHIR
  // status for callers (mostly the detail-page masthead) that haven't migrated.
  let meta: Meta;
  if (stage) {
    meta = STAGE_META[stage];
  } else {
    meta = STATUS_META[status ?? ''] ?? {
      label: status ?? '—',
      hint: '',
      bg: 'bg-zinc-100',
      fg: 'text-zinc-600',
      ring: 'ring-zinc-200',
      dot: 'bg-zinc-400',
    };
  }
  const px = size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5';
  const txt = size === 'md' ? 'text-[12.5px]' : 'text-[11.5px]';
  return (
    <span
      title={meta.hint}
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-medium ${px} ${txt} ${meta.bg} ${meta.fg} ${meta.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}
