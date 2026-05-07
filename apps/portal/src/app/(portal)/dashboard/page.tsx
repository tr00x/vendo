import type { Bundle, Patient, ServiceRequest, Appointment } from '@medplum/fhirtypes';
import { requireSession } from '@/lib/auth/guard';
import { ReferralsTable, type ReferralRow } from '@/components/dashboard/ReferralsTable';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { medplum } = await requireSession();

  const bundle: Bundle = await medplum.search(
    'ServiceRequest',
    '_sort=-_lastUpdated&_count=100&_include=ServiceRequest:subject',
  );

  const patients = new Map<string, Patient>();
  const srs: ServiceRequest[] = [];
  for (const entry of bundle.entry ?? []) {
    const r = entry.resource;
    if (r?.resourceType === 'ServiceRequest') srs.push(r);
    if (r?.resourceType === 'Patient' && r.id) patients.set(r.id, r);
  }

  // Pick the highest-priority active appointment per SR. Skip 'noshow' /
  // 'cancelled' so a row doesn't show a stale appointment date after the
  // visit was missed or called off.
  function apptRank(status?: Appointment['status']): number {
    switch (status) {
      case 'booked':    return 4;
      case 'pending':   return 3;
      case 'proposed':  return 2;
      case 'fulfilled': return 1;
      default:          return 0;
    }
  }
  const apptsBySrId = new Map<string, Appointment>();
  if (srs.length > 0) {
    const ids = srs.map((s) => `ServiceRequest/${s.id}`).join(',');
    try {
      const apptResults: Appointment[] = await medplum.searchResources(
        'Appointment',
        `based-on=${ids}&_count=200`,
      );
      for (const a of apptResults) {
        const ref = a.basedOn?.[0]?.reference;
        const srId = ref?.split('/')[1];
        if (!srId) continue;
        const incoming = apptRank(a.status);
        if (incoming === 0) continue;
        const current = apptsBySrId.get(srId);
        if (!current || apptRank(current.status) < incoming) {
          apptsBySrId.set(srId, a);
        }
      }
    } catch {
      // appointments are nice-to-have on the dashboard
    }
  }

  const rows: ReferralRow[] = srs.map((sr) => {
    const patientId = sr.subject?.reference?.split('/')[1];
    const patient = patientId ? patients.get(patientId) : undefined;
    const appointment = sr.id ? apptsBySrId.get(sr.id) : undefined;
    const out: ReferralRow = { serviceRequest: sr };
    if (patient) out.patient = patient;
    if (appointment) out.appointment = appointment;
    return out;
  });

  return <ReferralsTable rows={rows} />;
}
