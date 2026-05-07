/**
 * One-shot prod cleanup: remove Appointments / DocumentReferences /
 * Patients that were created during failed booking submits where the
 * ServiceRequest POST returned 400 (Medplum 5.x runs `type:transaction`
 * Bundles non-atomically, so the surviving sibling resources are orphans).
 *
 * Strategy:
 *   1. List every Appointment whose basedOn[0] points at a SR that no
 *      longer resolves → delete the Appointment.
 *   2. List every DocumentReference whose context.related[0] points at a
 *      missing SR → delete the DocumentReference.
 *   3. List every Patient that is referenced by NO ServiceRequest
 *      (subject) and NO Appointment (participant) → delete the Patient.
 *
 * Same env file as prod-bootstrap.ts (.env.prod). Idempotent.
 */
import './node-shims.js';
import type { MedplumClient } from '@medplum/core';
import type {
  Appointment,
  DocumentReference,
  Patient,
  ServiceRequest,
  Slot,
} from '@medplum/fhirtypes';
import { adminClient } from './test-helpers.js';

async function srExists(admin: MedplumClient, srId: string): Promise<boolean> {
  try {
    const sr = (await admin.readResource('ServiceRequest', srId)) as ServiceRequest;
    return Boolean(sr.id);
  } catch {
    return false;
  }
}

async function main() {
  const { client: admin } = await adminClient();
  console.warn('--- Cleanup orphans ---');

  // 1. Orphan Appointments
  const appts = (await admin.searchResources(
    'Appointment',
    '_count=200',
  )) as Appointment[];
  let apptDeleted = 0;
  for (const a of appts) {
    const srRef = a.basedOn?.[0]?.reference ?? '';
    if (!srRef.startsWith('ServiceRequest/')) continue;
    const srId = srRef.slice('ServiceRequest/'.length);
    if (await srExists(admin, srId)) continue;
    if (!a.id) continue;
    try {
      await admin.deleteResource('Appointment', a.id);
      apptDeleted++;
      console.warn(`  Appointment deleted (orphan basedOn=${srRef}): ${a.id}`);
    } catch (e) {
      console.warn(`  Appointment delete failed: ${a.id} — ${String(e)}`);
    }
  }
  console.warn(`Appointments cleaned: ${apptDeleted}`);

  // 2. Orphan DocumentReferences
  const docs = (await admin.searchResources(
    'DocumentReference',
    '_count=200',
  )) as DocumentReference[];
  let docDeleted = 0;
  for (const d of docs) {
    const srRef = d.context?.related?.[0]?.reference ?? '';
    if (!srRef.startsWith('ServiceRequest/')) continue;
    const srId = srRef.slice('ServiceRequest/'.length);
    if (await srExists(admin, srId)) continue;
    if (!d.id) continue;
    try {
      await admin.deleteResource('DocumentReference', d.id);
      docDeleted++;
      console.warn(`  DocumentReference deleted (orphan related=${srRef}): ${d.id}`);
    } catch (e) {
      console.warn(`  DocumentReference delete failed: ${d.id} — ${String(e)}`);
    }
  }
  console.warn(`DocumentReferences cleaned: ${docDeleted}`);

  // 3. Orphan Patients (no SR + no Appointment refers to them)
  const patients = (await admin.searchResources(
    'Patient',
    '_count=200',
  )) as Patient[];
  let patientDeleted = 0;
  for (const p of patients) {
    if (!p.id) continue;
    const srHits = await admin.searchResources('ServiceRequest', `subject=Patient/${p.id}&_count=1`);
    if (srHits.length > 0) continue;
    const apptHits = await admin.searchResources(
      'Appointment',
      `actor=Patient/${p.id}&_count=1`,
    );
    if (apptHits.length > 0) continue;
    try {
      await admin.deleteResource('Patient', p.id);
      patientDeleted++;
      console.warn(`  Patient deleted (orphan, no SR/Appt): ${p.id}`);
    } catch (e) {
      console.warn(`  Patient delete failed: ${p.id} — ${String(e)}`);
    }
  }
  console.warn(`Patients cleaned: ${patientDeleted}`);

  // 4. Stuck-busy Slots — search slots whose status=busy but have no
  // Appointment referencing them. Same root cause: Phase 1 of the wizard
  // submit locked the slot, Phase 2 (SR POST) returned 400, and the catch
  // path either didn't fire or hadn't been written yet at the time.
  const busySlots = (await admin.searchResources(
    'Slot',
    'status=busy&_count=200',
  )) as Slot[];
  let slotsFreed = 0;
  for (const s of busySlots) {
    if (!s.id) continue;
    const apptHits = await admin.searchResources(
      'Appointment',
      `slot=Slot/${s.id}&_count=1`,
    );
    if (apptHits.length > 0) continue; // legitimately booked
    try {
      await admin.updateResource({ ...s, status: 'free' as const });
      slotsFreed++;
      console.warn(`  Slot freed (no Appointment): ${s.id}`);
    } catch (e) {
      console.warn(`  Slot free failed: ${s.id} — ${String(e)}`);
    }
  }
  console.warn(`Slots freed: ${slotsFreed}`);

  console.warn('--- Done ---');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
