import type { Subscription } from '@medplum/fhirtypes';

/**
 * The 4 FHIR Subscriptions that wire bots to triggers. Used by `medplum bot
 * deploy` configuration in production.
 */
export function buildSubscriptions(botRefs: {
  newReferralBotId: string;
  apptBookedBotId: string;
  apptCancelledBotId: string;
  imagesReadyBotId: string;
}): Subscription[] {
  return [
    {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'Notify on new ServiceRequest',
      criteria: 'ServiceRequest?status=active',
      channel: { type: 'rest-hook', endpoint: `Bot/${botRefs.newReferralBotId}` },
    },
    {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'Notify on Appointment booked',
      criteria: 'Appointment?status=booked',
      channel: { type: 'rest-hook', endpoint: `Bot/${botRefs.apptBookedBotId}` },
    },
    {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'Notify on Appointment cancelled',
      criteria: 'Appointment?status=cancelled',
      channel: { type: 'rest-hook', endpoint: `Bot/${botRefs.apptCancelledBotId}` },
    },
    {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'Notify when images ready (note added with URL)',
      criteria: 'ServiceRequest?status=completed',
      channel: { type: 'rest-hook', endpoint: `Bot/${botRefs.imagesReadyBotId}` },
    },
  ];
}
