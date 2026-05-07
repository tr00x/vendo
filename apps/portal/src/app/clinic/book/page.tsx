import { requireClinicStaff } from '@/lib/auth/guard';
import { listAvailableSlots } from '@/lib/fhir/slots';
import { MODALITIES } from '@/lib/fhir/schemas';
import { WizardShell } from '@/components/wizard/WizardShell';
import type { InitialSlots } from '@/components/wizard/types';

export const dynamic = 'force-dynamic';

export default async function ClinicBookPage() {
  const { medplum } = await requireClinicStaff();
  const now = new Date();
  const twoWeeks = new Date(now.getTime() + 14 * 86_400_000);
  const slotsByModality: InitialSlots[] = await Promise.all(
    MODALITIES.map(async (modality) => {
      const slots = await listAvailableSlots(medplum, modality, now, twoWeeks);
      return {
        modality,
        slots: slots.slice(0, 400).map((s) => ({
          ...(s.id ? { id: s.id } : {}),
          ...(s.start ? { start: s.start } : {}),
          ...(s.end ? { end: s.end } : {}),
        })),
      };
    }),
  );

  return <WizardShell initialSlotsByModality={slotsByModality} mode="clinic" />;
}
