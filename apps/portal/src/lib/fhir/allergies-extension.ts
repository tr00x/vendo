import type { Extension, ServiceRequest } from '@medplum/fhirtypes';

export const ALLERGIES_EXT_URL = 'http://vendo.local/ext/allergies';

export interface AllergiesInput {
  /** Free text — comma-separated allergens, or empty when none reported. */
  text: string;
  /** Per-referral acknowledgment of IV-contrast allergy status. */
  ivContrast: 'yes' | 'no' | 'unknown';
}

/**
 * Build the allergies extension stored on the ServiceRequest. Stored on the
 * SR (not the Patient) because each referral carries its own snapshot of
 * allergy state — it's the doctor's attestation at the time of referring,
 * which is what the clinic needs to see for *this* study. A historical
 * AllergyIntolerance record can layer on later if multi-encounter history
 * becomes useful.
 */
export function buildAllergiesExtension(input: AllergiesInput): Extension {
  // Medplum 5.x enforces FHIR's ele-1 invariant strictly: an extension must
  // have either a value[x] OR nested extension[], not neither. An empty
  // valueString counts as "no value" by the validator, so we must omit the
  // text sub-extension entirely when the field is blank rather than
  // emitting `{ url: 'text', valueString: '' }`. iv-contrast is an enum
  // bound to the wizard reducer's default 'unknown' so it's always set.
  const inner: Extension[] = [];
  const trimmed = input.text.trim();
  if (trimmed.length > 0) {
    inner.push({ url: 'text', valueString: trimmed });
  }
  inner.push({ url: 'iv-contrast', valueCode: input.ivContrast });
  return { url: ALLERGIES_EXT_URL, extension: inner };
}

export interface AllergiesView {
  text: string;
  ivContrast: 'yes' | 'no' | 'unknown';
  /** True iff anything notable to surface in a banner: free text or iv=yes. */
  hasAlert: boolean;
}

/**
 * Read the allergies block off a ServiceRequest. Returns null when no block
 * was attached (older referrals from before Phase 2.3 shipped).
 */
export function readAllergies(sr: ServiceRequest | undefined): AllergiesView | null {
  const ext = sr?.extension?.find((e) => e.url === ALLERGIES_EXT_URL);
  if (!ext?.extension) return null;
  const text = (ext.extension.find((e) => e.url === 'text')?.valueString ?? '').trim();
  const ivRaw = ext.extension.find((e) => e.url === 'iv-contrast')?.valueCode;
  const ivContrast: 'yes' | 'no' | 'unknown' =
    ivRaw === 'yes' || ivRaw === 'no' || ivRaw === 'unknown' ? ivRaw : 'unknown';
  return {
    text,
    ivContrast,
    hasAlert: text.length > 0 || ivContrast === 'yes',
  };
}
