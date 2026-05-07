import { describe, it, expect } from 'vitest';
import type { ServiceRequest } from '@medplum/fhirtypes';
import {
  ALLERGIES_EXT_URL,
  buildAllergiesExtension,
  readAllergies,
} from '@/lib/fhir/allergies-extension';

describe('buildAllergiesExtension', () => {
  it('builds the canonical structure with text + iv-contrast inner extensions', () => {
    const ext = buildAllergiesExtension({ text: 'shellfish, iodine', ivContrast: 'yes' });
    expect(ext.url).toBe(ALLERGIES_EXT_URL);
    expect(ext.extension).toHaveLength(2);
    const text = ext.extension?.find((e) => e.url === 'text');
    const iv = ext.extension?.find((e) => e.url === 'iv-contrast');
    expect(text?.valueString).toBe('shellfish, iodine');
    expect(iv?.valueCode).toBe('yes');
  });

  it('omits the text extension when allergies text is empty (= no reported allergies)', () => {
    const ext = buildAllergiesExtension({ text: '', ivContrast: 'unknown' });
    const text = ext.extension?.find((e) => e.url === 'text');
    // FHIR validator rejects valueString === '' as "no value", so we omit
    // the extension entirely rather than emit it empty.
    expect(text).toBeUndefined();
  });
});

describe('readAllergies', () => {
  function srWith(allergiesExt: ReturnType<typeof buildAllergiesExtension>): ServiceRequest {
    return {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
      extension: [allergiesExt],
    };
  }

  it('returns null for an SR with no allergies extension (legacy referrals)', () => {
    const sr: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
    };
    expect(readAllergies(sr)).toBeNull();
  });

  it('flags hasAlert when free-text allergens are present', () => {
    const sr = srWith(buildAllergiesExtension({ text: 'latex', ivContrast: 'no' }));
    const v = readAllergies(sr);
    expect(v?.hasAlert).toBe(true);
    expect(v?.text).toBe('latex');
    expect(v?.ivContrast).toBe('no');
  });

  it('flags hasAlert when IV contrast is yes even with empty text', () => {
    const sr = srWith(buildAllergiesExtension({ text: '', ivContrast: 'yes' }));
    const v = readAllergies(sr);
    expect(v?.hasAlert).toBe(true);
    expect(v?.text).toBe('');
    expect(v?.ivContrast).toBe('yes');
  });

  it('does not flag hasAlert when nothing is reported', () => {
    const sr = srWith(buildAllergiesExtension({ text: '', ivContrast: 'no' }));
    expect(readAllergies(sr)?.hasAlert).toBe(false);
  });

  it('falls back to "unknown" when iv-contrast is missing or malformed', () => {
    const sr: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
      extension: [
        {
          url: ALLERGIES_EXT_URL,
          extension: [{ url: 'text', valueString: 'peanuts' }],
        },
      ],
    };
    const v = readAllergies(sr);
    expect(v?.ivContrast).toBe('unknown');
    expect(v?.text).toBe('peanuts');
  });
});
