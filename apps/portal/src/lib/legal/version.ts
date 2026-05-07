/**
 * Single source of truth for legal-document versioning.
 *
 * The signup form's accept-checkboxes record this version against the user's
 * Practitioner record so we can detect when terms changed and require a
 * fresh acknowledgement. Bump LEGAL_VERSION any time material content in
 * either the privacy notice or the terms changes; the per-document
 * `LAST_UPDATED` strings exist for human display only.
 */
export const LEGAL_VERSION = '2026-05-01';
export const PRIVACY_LAST_UPDATED = 'May 1, 2026';
export const TERMS_LAST_UPDATED = 'May 1, 2026';
