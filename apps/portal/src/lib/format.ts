// Phase 2.4 — every timestamp the user sees is rendered in the clinic's
// physical timezone, never the browser's. The clinic owns the schedule
// and a missed slot in PT-equivalent New York time is a real-world miss
// regardless of where the doctor's laptop is. The 'ET' suffix is shown so
// that intent is explicit. When/if multi-clinic support lands, this moves
// to per-clinic config; for v1.0 it's a single physical site.
export const CLINIC_TZ = 'America/New_York';
export const CLINIC_TZ_LABEL = 'ET';

/** Friendly relative-time formatting like "2 days ago", "in 3 hours". */
export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const diff = now - t;
  const past = diff >= 0;
  const abs = Math.abs(diff);
  const sec = Math.floor(abs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const month = Math.floor(day / 30);
  const year = Math.floor(day / 365);
  const fmt = (n: number, unit: string): string => {
    const s = `${n} ${unit}${n !== 1 ? 's' : ''}`;
    return past ? `${s} ago` : `in ${s}`;
  };
  if (sec < 45) return past ? 'just now' : 'in moments';
  if (min < 60) return fmt(min, 'minute');
  if (hr < 24) return fmt(hr, 'hour');
  if (day < 30) return fmt(day, 'day');
  if (month < 12) return fmt(month, 'month');
  return fmt(year, 'year');
}

/** Long human date in the clinic timezone: "Mon, May 4, 2026, 9:00 AM ET". */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const formatted = d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: CLINIC_TZ,
    });
    return `${formatted} ${CLINIC_TZ_LABEL}`;
  } catch {
    return iso;
  }
}

/** Time-only in the clinic timezone: "9:00 AM ET". */
export function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: CLINIC_TZ,
    })} ${CLINIC_TZ_LABEL}`;
  } catch {
    return iso;
  }
}

/** Compact day + time in the clinic timezone: "Tue, May 7 · 7:30 AM ET". */
export function formatDayTime(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const day = d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: CLINIC_TZ,
    });
    const time = d.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: CLINIC_TZ,
    });
    return `${day} · ${time} ${CLINIC_TZ_LABEL}`;
  } catch {
    return iso;
  }
}

/** "May 4, 2026" in the clinic timezone — date-only. */
export function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: CLINIC_TZ,
    });
  } catch {
    return iso;
  }
}

/** Compute age from YYYY-MM-DD */
export function ageFromDOB(dob: string | undefined, now = new Date()): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export interface ModalityMeta {
  code: 'MRI' | 'XRAY' | 'ARK';
  label: string;
  description: string;
  icon: string;
  /** Color name used to compose Tailwind class strings — single source of truth. */
  hue: 'violet' | 'amber' | 'teal' | 'zinc';
  /** Inline chip (badge): tinted bg + text + ring. Light + dark variants. */
  chipClass: string;
  /** Calendar/Today card: tinted bg + bold left-border + dark text. */
  cardClass: string;
  /** Solid dot — status / legend. */
  dotClass: string;
  /** Strong text-only color for accents in headings/labels. */
  textStrong: string;
}

const PALETTE = {
  violet: {
    chip:    'bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30',
    card:    'border-l-violet-500 bg-violet-50 ring-violet-200/60 dark:bg-violet-500/10 dark:ring-violet-500/30',
    dot:     'bg-violet-500',
    strong:  'text-violet-700 dark:text-violet-300',
  },
  amber: {
    chip:    'bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
    card:    'border-l-amber-500 bg-amber-50 ring-amber-200/60 dark:bg-amber-500/10 dark:ring-amber-500/30',
    dot:     'bg-amber-500',
    strong:  'text-amber-700 dark:text-amber-300',
  },
  teal: {
    chip:    'bg-teal-100 text-teal-800 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30',
    card:    'border-l-teal-500 bg-teal-50 ring-teal-200/60 dark:bg-teal-500/10 dark:ring-teal-500/30',
    dot:     'bg-teal-500',
    strong:  'text-teal-700 dark:text-teal-300',
  },
  zinc: {
    chip:    'bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:ring-zinc-500/30',
    card:    'border-l-zinc-500 bg-zinc-50 ring-zinc-200/60 dark:bg-zinc-500/10 dark:ring-zinc-500/30',
    dot:     'bg-zinc-400',
    strong:  'text-zinc-700 dark:text-zinc-300',
  },
} as const;

export const MODALITY_META: Record<string, ModalityMeta> = {
  MRI: {
    code: 'MRI', label: 'MRI', description: 'Magnetic Resonance Imaging', icon: 'M',
    hue: 'violet',
    chipClass: PALETTE.violet.chip, cardClass: PALETTE.violet.card,
    dotClass: PALETTE.violet.dot,   textStrong: PALETTE.violet.strong,
  },
  XRAY: {
    code: 'XRAY', label: 'X-Ray', description: 'Plain-film radiography', icon: 'X',
    hue: 'amber',
    chipClass: PALETTE.amber.chip, cardClass: PALETTE.amber.card,
    dotClass: PALETTE.amber.dot,   textStrong: PALETTE.amber.strong,
  },
  ARK: {
    code: 'ARK', label: 'Ultrasound', description: 'Diagnostic ultrasound (ARK)', icon: 'U',
    hue: 'teal',
    chipClass: PALETTE.teal.chip, cardClass: PALETTE.teal.card,
    dotClass: PALETTE.teal.dot,   textStrong: PALETTE.teal.strong,
  },
};

export function modalityMeta(code: string | undefined): ModalityMeta {
  return MODALITY_META[code ?? ''] ?? {
    code: 'MRI', label: code ?? 'Study', description: '', icon: '?',
    hue: 'zinc',
    chipClass: PALETTE.zinc.chip, cardClass: PALETTE.zinc.card,
    dotClass: PALETTE.zinc.dot,   textStrong: PALETTE.zinc.strong,
  };
}

/** Cute initials from a Patient.name (or fallback). */
export function patientInitials(family?: string, given?: string): string {
  const f = (family ?? '').charAt(0).toUpperCase();
  const g = (given ?? '').charAt(0).toUpperCase();
  return (g + f) || '??';
}

/** Stable color hash from a string (for avatar backgrounds). */
export function avatarColor(seed: string): string {
  const colors = [
    'bg-rose-100 text-rose-700',
    'bg-amber-100 text-amber-700',
    'bg-emerald-100 text-emerald-700',
    'bg-sky-100 text-sky-700',
    'bg-violet-100 text-violet-700',
    'bg-pink-100 text-pink-700',
    'bg-cyan-100 text-cyan-700',
    'bg-orange-100 text-orange-700',
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return colors[h % colors.length]!;
}
