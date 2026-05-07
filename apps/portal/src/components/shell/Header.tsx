'use client';

import Link from 'next/link';
import { useState } from 'react';
import { UserMenu } from './UserMenu';
import { BellIcon } from '@/components/ui/icons';
import { BRAND } from '@/lib/branding';

interface Props {
  userName: string;
  userEmail: string;
  userPractice: string;
  pendingCount: number;
  onMenuClick: () => void;
}

export function Header({ userName, userEmail, userPractice, pendingCount, onMenuClick }: Props) {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-hairline bg-bone/95 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-[2px] p-2 text-graphite hover:bg-hairline/60 md:hidden"
          aria-label="Open menu"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md bg-cta text-white"
            aria-hidden
          >
            <span className="text-[12px] font-semibold leading-none tracking-tightish">{BRAND.initials}</span>
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-tightish text-ink">
              {BRAND.name}
            </div>
            <div className="mt-0.5 hidden text-[11px] text-smoke sm:block">
              {BRAND.tagline}
            </div>
          </div>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className="relative rounded-[2px] p-2 text-graphite transition hover:bg-hairline/60"
            aria-label="Notifications"
          >
            <BellIcon className="h-5 w-5" />
            {pendingCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-cta px-1 text-[10px] font-semibold text-white ring-2 ring-bone tabular"
                title={`${pendingCount} ${pendingCount === 1 ? 'referral is' : 'referrals are'} awaiting scheduling`}
              >
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div
              className="absolute right-0 mt-2 w-80 rounded-md border border-hairline bg-paper shadow-lg animate-slide-up"
              role="dialog"
            >
              <div className="border-b border-hairline px-4 py-3">
                <div className="text-[13px] font-semibold tracking-tightish text-ink">
                  Pending referrals
                </div>
                <div className="mt-0.5 text-[12px] leading-snug text-smoke">
                  {pendingCount === 0
                    ? 'You have no pending referrals.'
                    : `${pendingCount} ${pendingCount === 1 ? 'referral is' : 'referrals are'} awaiting scheduling or imaging.`}
                </div>
              </div>
              <Link
                href="/dashboard?status=active"
                onClick={() => setNotifOpen(false)}
                className="block px-4 py-2.5 text-[13px] font-medium text-accent hover:bg-bone"
              >
                View pending list →
              </Link>
            </div>
          )}
        </div>
        <UserMenu name={userName} email={userEmail} practice={userPractice} />
      </div>
    </header>
  );
}
