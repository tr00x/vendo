import type { Extension } from '@medplum/fhirtypes';

export const INSURANCE_EXT_URL = 'http://vendo.local/ext/insurance';

export interface InsuranceInput {
  payor: string;
  memberId: string;
  groupNumber?: string;
}

export function buildInsuranceExtension(input: InsuranceInput): Extension {
  const inner: Extension[] = [
    { url: 'payor', valueString: input.payor },
    { url: 'memberId', valueString: input.memberId },
  ];
  if (input.groupNumber && input.groupNumber.length > 0) {
    inner.push({ url: 'groupNumber', valueString: input.groupNumber });
  }
  return { url: INSURANCE_EXT_URL, extension: inner };
}
