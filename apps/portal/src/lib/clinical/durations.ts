/**
 * Modality slot durations (minutes). Single source of truth referenced
 * by both the wizard (when projecting Appointment.end at submit time)
 * and the clinic (when scheduling against an opaque Slot whose .end may
 * have been carved at coarser granularity).
 *
 * Values are conservative tech-room times — they include patient prep,
 * positioning, and resetting between studies. Tune per clinic; do NOT
 * inline these constants elsewhere.
 */
export const MODALITY_DURATION_MINUTES = {
  MRI: 60,
  /** MRI with IV contrast — extra time for line, observation, and dye delay. */
  MRI_CONTRAST: 90,
  XRAY: 15,
  /** Ultrasound — abdomen / OB exams. */
  ARK: 30,
} as const;

export type ModalityKey = keyof typeof MODALITY_DURATION_MINUTES;

/** Resolve a duration in minutes for a study code. Falls back to 30 min
 *  for an unknown modality so the appointment still has a defined `end`. */
export function durationMinutesForModality(code: string | undefined, contrast = false): number {
  if (!code) return 30;
  if (code === 'MRI') return contrast ? MODALITY_DURATION_MINUTES.MRI_CONTRAST : MODALITY_DURATION_MINUTES.MRI;
  if (code in MODALITY_DURATION_MINUTES) {
    return MODALITY_DURATION_MINUTES[code as ModalityKey];
  }
  return 30;
}

/** Compute Appointment.end from a start ISO string + modality. */
export function appointmentEnd(startISO: string, modality: string | undefined, contrast = false): string {
  const minutes = durationMinutesForModality(modality, contrast);
  return new Date(new Date(startISO).getTime() + minutes * 60_000).toISOString();
}
