import type { Appointment, ServiceRequest } from '@medplum/fhirtypes';

export type Stage = 'submitted' | 'triaged' | 'scheduled' | 'completed' | 'closed';

export interface StageMeta {
  key: Stage;
  label: string;
  short: string;
  description: string;
  color: 'amber' | 'indigo' | 'sky' | 'emerald' | 'neutral';
}

export const STAGE_ORDER: StageMeta[] = [
  { key: 'submitted', label: 'Submitted', short: 'New', description: 'Clinic has your referral.', color: 'amber' },
  { key: 'triaged', label: 'In triage', short: 'Triage', description: 'Clinic is checking insurance and calling your patient.', color: 'indigo' },
  { key: 'scheduled', label: 'Scheduled', short: 'Booked', description: 'Patient has a confirmed appointment.', color: 'sky' },
  { key: 'completed', label: 'Imaging done', short: 'Imaged', description: 'Images taken. Waiting for the report.', color: 'emerald' },
  { key: 'closed', label: 'Report sent', short: 'Closed', description: 'Report has been delivered.', color: 'neutral' },
];

const FLAG_EXT_URL = 'http://vendo.local/ext/clinic-flags';
const CLOSED_OUT_EXT_URL = 'http://vendo.local/ext/closed-out';
/** Sticky timestamp marking the moment the SR first entered triage. Once set,
 *  the SR never falls back to `submitted` regardless of flag toggles. */
const TRIAGED_AT_EXT_URL = 'http://vendo.local/ext/triaged-at';
const PACS_LINK_RE = /Images available:\s*(https?:\/\/[^\s<>"]+)/i;

export const TRIAGED_AT_EXTENSION_URL = TRIAGED_AT_EXT_URL;

export interface StageInput {
  sr: ServiceRequest;
  appointment?: Appointment | undefined;
}

export function deriveStage({ sr, appointment }: StageInput): Stage {
  if (sr.status === 'revoked') return 'closed';
  if (isClosedOut(sr.extension)) return 'closed';
  if (sr.status === 'completed') return 'completed';
  if (appointment?.status === 'fulfilled') return 'completed';
  if (appointment?.status === 'booked') return 'scheduled';
  // Phase 2.5 — a no-show appointment falls back to 'triaged' so the
  // referral re-enters the active queue (clinic must rebook or cancel).
  // The slot itself is freed by markNoShowAction in clinic/actions.ts.
  if (appointment?.status === 'noshow') return 'triaged';
  // Stage is monotonic up to scheduling: once any flag has ever been set
  // (recorded by the sticky `triagedAt` extension), the SR stays at
  // 'triaged' even after the flag is toggled back off. This prevents the
  // pipeline UI from regressing when clinic-staff uncheck a flag mid-flow.
  const flags = readFlagsFromExt(sr.extension);
  const anyFlag = Object.values(flags).some(Boolean);
  if (anyFlag || hasTriagedAt(sr.extension)) return 'triaged';
  return 'submitted';
}

export function hasTriagedAt(ext: ServiceRequest['extension']): boolean {
  return ext?.some((x) => x.url === TRIAGED_AT_EXT_URL && Boolean(x.valueDateTime)) ?? false;
}

export function isClosedOut(ext: ServiceRequest['extension']): boolean {
  return ext?.some((x) => x.url === CLOSED_OUT_EXT_URL && x.valueBoolean === true) ?? false;
}

export const CLOSED_OUT_EXTENSION_URL = CLOSED_OUT_EXT_URL;

export function stageIndex(stage: Stage): number {
  return STAGE_ORDER.findIndex((s) => s.key === stage);
}

export function stageMeta(stage: Stage): StageMeta {
  return STAGE_ORDER.find((s) => s.key === stage) ?? STAGE_ORDER[0]!;
}

export function hasPacsLink(sr: ServiceRequest): boolean {
  return (sr.note ?? []).some((n) => PACS_LINK_RE.test(n.text ?? ''));
}

export function pacsLinkOf(sr: ServiceRequest): string | undefined {
  // Iterate in reverse so the LATEST `Images available: <url>` note wins.
  // SR.note is append-only; if a tech re-runs the study or a new link is
  // attached, the most recent one is the active one.
  const notes = sr.note ?? [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const m = (notes[i]!.text ?? '').match(PACS_LINK_RE);
    if (m && m[1]) return m[1].replace(/[.,);\]]+$/, '');
  }
  return undefined;
}

export type ClinicFlagKey = 'insuranceVerified' | 'patientCalled' | 'prepInstructionsSent' | 'arrivedToday';

export function readFlagsFromExt(ext: ServiceRequest['extension']): Record<ClinicFlagKey, boolean> {
  const out: Record<ClinicFlagKey, boolean> = {
    insuranceVerified: false,
    patientCalled: false,
    prepInstructionsSent: false,
    arrivedToday: false,
  };
  const flagsExt = ext?.find((x) => x.url === FLAG_EXT_URL);
  for (const e of flagsExt?.extension ?? []) {
    if (!e.url) continue;
    const k = e.url as ClinicFlagKey;
    if (k in out && typeof e.valueBoolean === 'boolean') out[k] = e.valueBoolean;
  }
  return out;
}

export const FLAG_EXTENSION_URL = FLAG_EXT_URL;

/** SLA aging — flag rows that have been sitting in submitted/triaged too
 *  long. Returns null when within healthy window. The thresholds match the
 *  pilot's verbal SLA: clinic responds to a fresh referral within 1 business
 *  day; once in triage, scheduling should land within 2 business days. */
export interface SlaAlert { days: number; severity: 'warn' | 'danger' }
export function slaAlert(stage: Stage, sentIso: string | undefined): SlaAlert | null {
  if (stage !== 'submitted' && stage !== 'triaged') return null;
  if (!sentIso) return null;
  const t = new Date(sentIso).getTime();
  if (isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (stage === 'submitted') {
    if (days >= 2) return { days, severity: 'danger' };
    if (days >= 1) return { days, severity: 'warn' };
  } else {
    if (days >= 4) return { days, severity: 'danger' };
    if (days >= 3) return { days, severity: 'warn' };
  }
  return null;
}
