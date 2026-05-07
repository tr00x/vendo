import { describe, it, expect } from 'vitest';
import {
  newReferralEmail,
  apptBookedEmail,
  apptCancelledEmail,
  imagesReadyEmail,
} from '../src/lib/templates.js';

describe('email templates', () => {
  it('newReferralEmail subject contains modality', () => {
    const e = newReferralEmail({ referrerName: 'Dr Smith', modality: 'MRI', patientFirst: 'Alice' });
    expect(e.subject).toContain('MRI');
    expect(e.html).toContain('Dr Smith');
  });

  it('apptBookedEmail formats start', () => {
    const e = apptBookedEmail({ modality: 'XRAY', start: '2026-05-04T09:00' });
    expect(e.subject).toContain('XRAY');
    expect(e.text).toContain('2026-05-04');
  });

  it('apptCancelledEmail communicates cancellation', () => {
    const e = apptCancelledEmail({ modality: 'ARK', start: '2026-05-04T09:00' });
    expect(e.subject.toLowerCase()).toContain('cancelled');
  });

  it('imagesReadyEmail contains deeplink in html', () => {
    const e = imagesReadyEmail({ modality: 'MRI', deeplink: 'https://images.example/123' });
    expect(e.html).toContain('https://images.example/123');
  });

  it('escapes HTML in user-supplied fields', () => {
    const e = newReferralEmail({ referrerName: '<script>x</script>', modality: 'MRI', patientFirst: 'A' });
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;');
  });
});
