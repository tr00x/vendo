// Single source of truth for clinic branding strings.
// Env-driven so the same code base can run for any tenant without
// recompiling. Defaults are placeholder values for the public showcase.
//
// All vars are NEXT_PUBLIC_* so they bake into the client bundle —
// brand strings are not secrets.

export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Vendo Demo Clinic',
  shortName: process.env.NEXT_PUBLIC_BRAND_SHORT_NAME ?? 'Vendo Demo',
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? 'Imaging & Diagnostics',
  initials: process.env.NEXT_PUBLIC_BRAND_INITIALS ?? 'VD',
  phone: process.env.NEXT_PUBLIC_BRAND_PHONE ?? '(555) 010-0100',
  phoneTel: process.env.NEXT_PUBLIC_BRAND_PHONE_TEL ?? '5550100100',
  phoneAlt: process.env.NEXT_PUBLIC_BRAND_PHONE_ALT ?? '(555) 010-0101',
  phoneAltTel: process.env.NEXT_PUBLIC_BRAND_PHONE_ALT_TEL ?? '5550100101',
  address: process.env.NEXT_PUBLIC_BRAND_ADDRESS ?? '100 Example Street, Springfield, IL 62701',
  hours: process.env.NEXT_PUBLIC_BRAND_HOURS ?? 'M–F 9am–7pm · Sat–Sun closed',
  portalUrl: process.env.NEXT_PUBLIC_BRAND_PORTAL_URL ?? 'https://portal.example.com',
  supportEmail: process.env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL ?? 'info@example.com',
  recordsEmail: process.env.NEXT_PUBLIC_BRAND_RECORDS_EMAIL ?? 'records@example.com',
} as const;

export type Brand = typeof BRAND;
