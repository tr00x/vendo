import { describe, it, expect } from 'vitest';
import {
  BRAND,
  cancelledTemplate,
  completedTemplate,
  noShowTemplate,
  rescheduledTemplate,
  scheduledTemplate,
} from '@/lib/email/templates';

const doctor = { given: 'Sarah', family: 'Smith' };
const patient = { given: 'James', family: 'Doe' };
const study = { modality: 'MRI' as const, bodyPart: 'Right knee' };
const SR_ID = 'sr-abc123';
// 11:30 AM EDT on Thu May 7 2026.
const START = '2026-05-07T15:30:00.000Z';

describe('email templates — Phase 1.9', () => {
  it('all templates produce subject + non-empty text + non-empty html', () => {
    const all = [
      scheduledTemplate({ doctor, patient, study, startIso: START, serviceRequestId: SR_ID }),
      rescheduledTemplate({
        doctor,
        patient,
        study,
        startIso: START,
        previousStartIso: '2026-05-05T13:00:00.000Z',
        reason: 'Tech equipment service window',
        serviceRequestId: SR_ID,
      }),
      cancelledTemplate({
        doctor,
        patient,
        study,
        reason: 'Patient called — symptoms resolved.',
        cancelledBy: 'clinic',
        serviceRequestId: SR_ID,
      }),
      completedTemplate({
        doctor,
        patient,
        study,
        pacsLink: 'https://pacs.example.com/study-1',
        serviceRequestId: SR_ID,
      }),
      noShowTemplate({
        doctor,
        patient,
        study,
        appointmentStartIso: START,
        serviceRequestId: SR_ID,
      }),
    ];
    for (const e of all) {
      expect(e.subject.length).toBeGreaterThan(0);
      expect(e.text.length).toBeGreaterThan(20);
      expect(e.html).toMatch(/^<!doctype html>/i);
      // Brand chrome present in every email so the recipient recognizes it.
      expect(e.text).toContain(BRAND.shortName);
      expect(e.html).toContain(BRAND.name);
      expect(e.html).toContain(BRAND.phone);
    }
  });

  it('scheduled template includes patient name and clinic-TZ time', () => {
    const e = scheduledTemplate({
      doctor,
      patient,
      study,
      startIso: START,
      serviceRequestId: SR_ID,
    });
    expect(e.subject).toContain('James Doe');
    expect(e.subject).toContain('11:30 AM ET');
    expect(e.text).toContain('MRI — Right knee');
    expect(e.text).toContain(`${BRAND.portalUrl}/refer/${SR_ID}`);
  });

  it('rescheduled template surfaces both old and new times plus reason', () => {
    const e = rescheduledTemplate({
      doctor,
      patient,
      study,
      startIso: START,
      previousStartIso: '2026-05-05T13:00:00.000Z',
      reason: 'Equipment service window',
      serviceRequestId: SR_ID,
    });
    expect(e.text).toContain('Was:');
    expect(e.text).toContain('Now:');
    expect(e.text).toContain('11:30 AM ET'); // new
    expect(e.text).toContain('9:00 AM ET'); // old
    expect(e.text).toContain('Equipment service window');
  });

  it('cancelled template differentiates clinic vs referrer source', () => {
    const byClinic = cancelledTemplate({
      doctor,
      patient,
      study,
      reason: 'Patient withdrew',
      cancelledBy: 'clinic',
      serviceRequestId: SR_ID,
    });
    const byReferrer = cancelledTemplate({
      doctor,
      patient,
      study,
      reason: 'Symptoms resolved',
      cancelledBy: 'referrer',
      serviceRequestId: SR_ID,
    });
    expect(byClinic.text).toContain('the clinic');
    expect(byReferrer.text).toContain('the referring office');
  });

  it('completed template links the PACS URL when present, omits it when not', () => {
    const withLink = completedTemplate({
      doctor,
      patient,
      study,
      pacsLink: 'https://pacs.example.com/x',
      serviceRequestId: SR_ID,
    });
    const noLink = completedTemplate({
      doctor,
      patient,
      study,
      pacsLink: undefined,
      serviceRequestId: SR_ID,
    });
    expect(withLink.text).toContain('https://pacs.example.com/x');
    expect(withLink.html).toContain('View the study images');
    expect(noLink.html).not.toContain('View the study images');
  });

  it('escapes HTML entities in user-supplied free-text reasons', () => {
    const e = cancelledTemplate({
      doctor,
      patient,
      study,
      reason: 'Patient said "<no thanks>" via phone',
      cancelledBy: 'clinic',
      serviceRequestId: SR_ID,
    });
    expect(e.html).not.toContain('<no thanks>');
    expect(e.html).toContain('&lt;no thanks&gt;');
    // Plain-text version doesn't need escaping.
    expect(e.text).toContain('"<no thanks>"');
  });

  it('falls back gracefully when patient or doctor name is empty', () => {
    const e = scheduledTemplate({
      doctor: { given: '', family: '' },
      patient: { given: '', family: '' },
      study,
      startIso: START,
      serviceRequestId: SR_ID,
    });
    expect(e.subject).toContain('your patient');
    expect(e.text).toContain('Doctor');
  });
});
