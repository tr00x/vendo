import { NextResponse } from 'next/server';
import { touchSession, peekSession } from '@/lib/auth/guard';

/**
 * Bump the user's idle expiry. Called by the IdleWarning client component
 * when the user clicks "Stay logged in" near the timeout. Idempotent.
 */
export async function POST() {
  const peek = await peekSession();
  if (!peek?.accessToken || !peek.expiresAt || peek.expiresAt < Date.now()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await touchSession();
  // Return the new expiresAt so the client can reset its timer without a
  // second GET round-trip.
  const fresh = await peekSession();
  return NextResponse.json({ ok: true, expiresAt: fresh?.expiresAt ?? null });
}
