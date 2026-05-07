import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

/** Post-login routing helper: send each user to the surface that matches
 *  their AccessPolicy role. */
export default async function RoleRouter() {
  const ctx = await requireSession();
  if (ctx.role === 'ClinicStaff') redirect('/clinic/inbox');
  redirect('/dashboard');
}
