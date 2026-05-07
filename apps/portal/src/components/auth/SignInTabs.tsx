'use client';

import { useState } from 'react';
import { PasswordForm } from './PasswordForm';
import { MagicLinkForm } from './MagicLinkForm';

type Tab = 'password' | 'link';

/**
 * Tab toggle between the two sign-in modes:
 *   - "Password" runs the existing email/password flow against
 *     /api/auth/login (Medplum-backed, manual creds set by clinic staff).
 *   - "Email link" requests a one-tap branded magic link via
 *     /api/auth/magic/request — no password needed.
 *
 * The state is purely client-side; we don't persist the choice across
 * sessions because (a) cookie surface is already crowded and (b) the
 * cost of a single click to switch is negligible.
 */
export function SignInTabs({ next }: { next: string }) {
  const [tab, setTab] = useState<Tab>('password');

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="mb-4 inline-flex w-full overflow-hidden rounded-md border border-hairline bg-bone p-0.5"
      >
        <button
          type="button"
          role="tab"
          id="signin-tab-password"
          aria-selected={tab === 'password'}
          aria-controls="signin-panel-password"
          onClick={() => setTab('password')}
          className={`flex-1 rounded px-3 py-1.5 text-[13px] font-medium transition ${
            tab === 'password'
              ? 'bg-paper text-ink shadow-sm'
              : 'text-smoke hover:text-graphite'
          }`}
        >
          Password
        </button>
        <button
          type="button"
          role="tab"
          id="signin-tab-link"
          aria-selected={tab === 'link'}
          aria-controls="signin-panel-link"
          onClick={() => setTab('link')}
          className={`flex-1 rounded px-3 py-1.5 text-[13px] font-medium transition ${
            tab === 'link'
              ? 'bg-paper text-ink shadow-sm'
              : 'text-smoke hover:text-graphite'
          }`}
        >
          Email link
        </button>
      </div>

      <div
        role="tabpanel"
        id="signin-panel-password"
        aria-labelledby="signin-tab-password"
        hidden={tab !== 'password'}
      >
        {tab === 'password' && <PasswordForm next={next} />}
      </div>
      <div
        role="tabpanel"
        id="signin-panel-link"
        aria-labelledby="signin-tab-link"
        hidden={tab !== 'link'}
      >
        {tab === 'link' && <MagicLinkForm />}
      </div>
    </div>
  );
}
