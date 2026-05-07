import type { Bundle, Patient, Practitioner, ServiceRequest, Appointment } from '@medplum/fhirtypes';
import { requireClinicStaff } from '@/lib/auth/guard';
import { InboxTable, type InboxRow } from '@/components/clinic/InboxTable';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const { medplum } = await requireClinicStaff();

  // Fetch all SR with included patient + requester (practitioner).
  const bundle: Bundle = await medplum.search(
    'ServiceRequest',
    '_sort=-_lastUpdated&_count=100&_include=ServiceRequest:subject&_include=ServiceRequest:requester',
  );

  const patients = new Map<string, Patient>();
  const practitioners = new Map<string, Practitioner>();
  const srs: ServiceRequest[] = [];
  for (const e of bundle.entry ?? []) {
    const r = e.resource;
    if (r?.resourceType === 'ServiceRequest') srs.push(r);
    else if (r?.resourceType === 'Patient' && r.id) patients.set(r.id, r);
    else if (r?.resourceType === 'Practitioner' && r.id) practitioners.set(r.id, r);
  }

  // Fetch appointments based-on these SRs. Pick the most relevant one per
  // SR: an active 'booked' wins over anything else, since the inbox row's
  // "When" cell shows the upcoming appointment. A 'noshow' or 'cancelled'
  // appointment must NOT shadow the absence of a real booking — otherwise
  // the row reads as "Pending · Wed May 6 · Appointment" after a no-show
  // even though the slot is freed.
  function apptRank(status?: Appointment['status']): number {
    switch (status) {
      case 'booked':    return 4;
      case 'pending':   return 3;
      case 'proposed':  return 2;
      case 'fulfilled': return 1;
      // 'noshow', 'cancelled', 'arrived', 'checked-in', 'entered-in-error', 'waitlist' — treat as no-active.
      default:          return 0;
    }
  }
  const apptBySr = new Map<string, Appointment>();
  if (srs.length > 0) {
    const ids = srs.map((s) => `ServiceRequest/${s.id}`).join(',');
    try {
      const appts: Appointment[] = await medplum.searchResources(
        'Appointment',
        `based-on=${ids}&_count=200`,
      );
      for (const a of appts) {
        const ref = a.basedOn?.[0]?.reference;
        const srId = ref?.split('/')[1];
        if (!srId) continue;
        const incoming = apptRank(a.status);
        if (incoming === 0) continue; // skip no-show / cancelled / etc.
        const current = apptBySr.get(srId);
        if (!current || apptRank(current.status) < incoming) {
          apptBySr.set(srId, a);
        }
      }
    } catch {
      // optional
    }
  }

  const rows: InboxRow[] = srs.map((sr) => {
    const patientId = sr.subject?.reference?.split('/')[1];
    const requesterId = sr.requester?.reference?.split('/')[1];
    const row: InboxRow = { serviceRequest: sr };
    if (patientId && patients.has(patientId)) row.patient = patients.get(patientId);
    if (requesterId && practitioners.has(requesterId)) row.requester = practitioners.get(requesterId);
    if (sr.id && apptBySr.has(sr.id)) row.appointment = apptBySr.get(sr.id);
    return row;
  });

  return <InboxTable rows={rows} />;
}
