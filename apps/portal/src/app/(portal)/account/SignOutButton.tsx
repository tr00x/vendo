'use client';

import { useTransition } from 'react';
import { signOut } from '@/components/shell/actions';

export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => signOut())}
      disabled={pending}
      title="Sign out of this device — you'll need to enter your password again to come back."
      className="inline-flex items-center justify-center rounded-md border border-signal-stop/30 bg-paper px-3 py-1.5 text-[12.5px] font-medium text-signal-stop transition hover:bg-signal-stop/5 disabled:opacity-50"
    >
      {pending ? 'Signing out…' : 'Sign out of this device'}
    </button>
  );
}
