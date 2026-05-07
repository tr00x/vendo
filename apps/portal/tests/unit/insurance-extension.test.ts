import { describe, it, expect } from 'vitest';
import { buildInsuranceExtension, INSURANCE_EXT_URL } from '@/lib/fhir/insurance-extension';

describe('buildInsuranceExtension', () => {
  it('produces the documented shape for full input', () => {
    expect(
      buildInsuranceExtension({ payor: 'Aetna', memberId: 'M-1', groupNumber: 'G-9' }),
    ).toEqual({
      url: INSURANCE_EXT_URL,
      extension: [
        { url: 'payor', valueString: 'Aetna' },
        { url: 'memberId', valueString: 'M-1' },
        { url: 'groupNumber', valueString: 'G-9' },
      ],
    });
  });

  it('omits groupNumber when not provided', () => {
    const ext = buildInsuranceExtension({ payor: 'Aetna', memberId: 'M-1' });
    expect(ext.extension?.find((e) => e.url === 'groupNumber')).toBeUndefined();
  });

  it('omits groupNumber when empty string', () => {
    const ext = buildInsuranceExtension({ payor: 'Aetna', memberId: 'M-1', groupNumber: '' });
    expect(ext.extension?.length).toBe(2);
  });
});
