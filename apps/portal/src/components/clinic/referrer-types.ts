import { z } from 'zod';

export const InviteReferrerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80, 'Too long'),
  lastName: z.string().trim().min(1, 'Last name is required').max(80, 'Too long'),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  // Initial password chosen by staff. Medplum's policy floor is 8 chars; we
  // bump to 12 to align with the Sign-in / change-password rules elsewhere
  // in the portal. Staff can reveal the field while typing.
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Too long'),
  phone: z
    .string()
    .trim()
    .max(40, 'Too long')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  practice: z
    .string()
    .trim()
    .max(200, 'Too long')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});

export type InviteReferrerInput = z.input<typeof InviteReferrerSchema>;

export type InviteReferrerResult =
  | { ok: true; practitionerId: string; email: string }
  | { ok: false; error: string };

// ---------- update / password / deactivate / reactivate ----------

export const UpdateReferrerSchema = z.object({
  practitionerId: z.string().min(1, 'practitionerId is required'),
  firstName: z.string().trim().min(1, 'First name is required').max(80, 'Too long'),
  lastName: z.string().trim().min(1, 'Last name is required').max(80, 'Too long'),
  phone: z
    .string()
    .trim()
    .max(40, 'Too long')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  practice: z
    .string()
    .trim()
    .max(200, 'Too long')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});

export type UpdateReferrerInput = z.input<typeof UpdateReferrerSchema>;

export const ResetReferrerPasswordSchema = z.object({
  practitionerId: z.string().min(1),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Too long'),
});

export type ResetReferrerPasswordInput = z.input<typeof ResetReferrerPasswordSchema>;

export const DeactivateReferrerSchema = z.object({
  practitionerId: z.string().min(1),
});

export type DeactivateReferrerInput = z.input<typeof DeactivateReferrerSchema>;

export const ReactivateReferrerSchema = z.object({
  practitionerId: z.string().min(1),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Too long'),
});

export type ReactivateReferrerInput = z.input<typeof ReactivateReferrerSchema>;

export const SendMagicLinkSchema = z.object({
  practitionerId: z.string().min(1),
});

export type SendMagicLinkInput = z.input<typeof SendMagicLinkSchema>;

export type SendMagicLinkResult =
  | { ok: true; email: string; expiresAtIso: string }
  | { ok: false; error: string };

export type ReferrerActionResult =
  | { ok: true }
  | { ok: false; error: string };
