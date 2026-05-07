export const VENDO_BOTS_VERSION = '0.1.0';
export { handler as notifyNewReferral } from './notify-new-referral.js';
export { handler as notifyApptBooked } from './notify-appt-booked.js';
export { handler as notifyApptCancelled } from './notify-appt-cancelled.js';
export { handler as notifyImagesReady } from './notify-images-ready.js';
export { buildSubscriptions } from './lib/subscriptions.js';
export { withRetry, isTransient, DEFAULT_RETRY_OPTS } from './lib/retry.js';
export { sendEmail, setEmailTransportForTesting } from './lib/email.js';
export {
  newReferralEmail,
  apptBookedEmail,
  apptCancelledEmail,
  imagesReadyEmail,
} from './lib/templates.js';
