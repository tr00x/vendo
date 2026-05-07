'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserMenu } from '@/components/shell/UserMenu';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { IdleWarning } from '@/components/auth/IdleWarning';
import {
  BellIcon,
  HomeIcon,
  CalendarIcon,
  PlusIcon,
  StethoscopeIcon,
} from '@/components/ui/icons';
import { BRAND } from '@/lib/branding';

interface Props {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userPractice: string;
  pendingCount: number;
  sessionExpiresAt?: number | null;
}

const NAV = [
  { href: '/clinic/book',      label: 'New booking', description: 'Schedule a walk-in patient',   icon: PlusIcon },
  { href: '/clinic/inbox',     label: 'Inbox',       description: 'Incoming referrals',           icon: HomeIcon },
  { href: '/clinic/today',     label: 'Schedule',    description: 'Today, tomorrow, the week',    icon: CalendarIcon },
  { href: '/clinic/referrers', label: 'Referrers',   description: 'Physicians with portal access', icon: StethoscopeIcon },
];

const STORAGE_KEY = 'vendo.clinic.sidebar.collapsed';

export function ClinicShell({ children, userName, userEmail, userPractice, pendingCount, sessionExpiresAt }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '0') setCollapsed(false);
    } catch {}
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (!notifRef.current?.contains(e.target as Node)) setNotifOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [notifOpen]);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-bone">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-hairline bg-bone transition-[width] ${
          collapsed
            ? 'w-16 duration-150 ease-[cubic-bezier(0.4,0,1,1)]'
            : 'w-64 duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)]'
        }`}
        aria-label="Clinic navigation"
        data-collapsed={collapsed}
      >
        {/* Logo */}
        <Link
          href="/clinic/inbox"
          className={`flex flex-shrink-0 items-center border-b border-hairline transition ${
            collapsed ? 'justify-center gap-0 px-2 py-3' : 'gap-2.5 px-3 py-3'
          }`}
          title={`${BRAND.name} — Clinic operations`}
        >
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-cta text-white"
            aria-hidden
          >
            <span className="text-[12px] font-semibold leading-none tracking-tightish">{BRAND.initials}</span>
          </div>
          <div
            className={`grid overflow-hidden transition-[grid-template-rows,grid-template-columns,opacity] ${
              collapsed
                ? 'grid-cols-[0fr] grid-rows-[0fr] opacity-0 duration-150 ease-[cubic-bezier(0.4,0,1,1)]'
                : 'grid-cols-[1fr] grid-rows-[1fr] opacity-100 duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] delay-[60ms]'
            }`}
          >
            <div className="min-h-0 min-w-0 whitespace-nowrap leading-tight">
              <div className="text-[13.5px] font-semibold tracking-tightish text-ink">
                {BRAND.shortName}
              </div>
              <div className="text-[10.5px] text-smoke">Clinic operations</div>
            </div>
          </div>
        </Link>

        {/* Nav */}
        <nav className={`flex flex-1 flex-col gap-1 overflow-y-auto ${collapsed ? 'p-2' : 'p-3'}`}>
          {NAV.map((it) => {
            const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                title={`${it.label} — ${it.description}`}
                className={`group flex rounded-md transition ${
                  collapsed ? 'h-10 items-center justify-center gap-0' : 'items-start gap-2.5 px-2.5 py-2'
                } ${
                  active
                    ? 'bg-paper text-ink shadow-[0_0_0_1px_var(--hairline)]'
                    : 'text-graphite hover:bg-hairline/50 hover:text-ink'
                }`}
                aria-label={it.label}
                aria-current={active ? 'page' : undefined}
              >
                <Icon
                  className={`h-4 w-4 flex-shrink-0 ${collapsed ? '' : 'mt-0.5'} ${
                    active ? 'text-ink' : 'text-smoke group-hover:text-ink'
                  }`}
                />
                <div
                  className={`grid overflow-hidden transition-[grid-template-rows,grid-template-columns,opacity] ${
                    collapsed
                      ? 'grid-cols-[0fr] grid-rows-[0fr] opacity-0 duration-150 ease-[cubic-bezier(0.4,0,1,1)]'
                      : 'grid-cols-[1fr] grid-rows-[1fr] opacity-100 duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] delay-[80ms]'
                  }`}
                >
                  <div className="min-h-0 min-w-0 whitespace-nowrap">
                    <div className="text-[13.5px] font-medium tracking-tightish leading-tight">
                      {it.label}
                    </div>
                    <div className={`mt-0.5 text-[11.5px] leading-tight ${active ? 'text-graphite' : 'text-smoke'}`}>
                      {it.description}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom utility cluster */}
        <div className="flex flex-shrink-0 flex-col gap-1 border-t border-hairline p-2">
          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              title={pendingCount === 0 ? 'No pending notifications' : `${pendingCount} pending referral${pendingCount === 1 ? '' : 's'}`}
              className={`flex w-full items-center rounded-md text-graphite transition hover:bg-hairline/60 hover:text-ink ${
                collapsed ? 'justify-center gap-0 p-2' : 'gap-2.5 px-2.5 py-2'
              }`}
            >
              <div className="relative">
                <BellIcon className="h-4 w-4" />
                {pendingCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-cta px-0.5 text-[9px] font-semibold text-white ring-2 ring-bone tabular">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </div>
              <div
                className={`grid overflow-hidden transition-[grid-template-rows,grid-template-columns,opacity] ${
                  collapsed
                    ? 'grid-cols-[0fr] grid-rows-[0fr] opacity-0 duration-150 ease-[cubic-bezier(0.4,0,1,1)]'
                    : 'grid-cols-[1fr] grid-rows-[1fr] opacity-100 duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] delay-[100ms]'
                }`}
              >
                <span className="min-h-0 min-w-0 whitespace-nowrap text-[13px] font-medium tracking-tightish">
                  {pendingCount > 0 ? `Pending (${pendingCount})` : 'Notifications'}
                </span>
              </div>
            </button>
            {notifOpen && (
              <div
                className="absolute bottom-0 left-full z-50 ml-2 w-72 overflow-hidden rounded-md border border-hairline bg-paper shadow-lg animate-slide-up"
                role="dialog"
              >
                <div className="border-b border-hairline px-4 py-3">
                  <div className="text-[13px] font-semibold tracking-tightish text-ink">
                    Pending referrals
                  </div>
                  <div className="mt-0.5 text-[12px] leading-snug text-smoke">
                    {pendingCount === 0
                      ? 'You have no pending referrals.'
                      : `${pendingCount} ${pendingCount === 1 ? 'referral is' : 'referrals are'} awaiting action.`}
                  </div>
                </div>
                <Link
                  href="/clinic/inbox"
                  onClick={() => setNotifOpen(false)}
                  className="block px-4 py-2.5 text-[13px] font-medium text-accent hover:bg-bone"
                >
                  Open inbox →
                </Link>
              </div>
            )}
          </div>

          {/* User menu */}
          <div className={collapsed ? 'flex justify-center' : ''}>
            <UserMenu name={userName} email={userEmail} practice={userPractice} variant={collapsed ? 'icon' : 'full'} />
          </div>

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className={`flex items-center rounded-md text-graphite transition hover:bg-hairline/60 hover:text-ink ${
              collapsed ? 'justify-center gap-0 p-2' : 'gap-2.5 px-2.5 py-2'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" />
              <path d="M9 4v16" />
              {collapsed ? <path d="m13 9 3 3-3 3" /> : <path d="m17 9-3 3 3 3" />}
            </svg>
            <div
              className={`grid overflow-hidden transition-[grid-template-rows,grid-template-columns,opacity] ${
                collapsed
                  ? 'grid-cols-[0fr] grid-rows-[0fr] opacity-0 duration-150 ease-[cubic-bezier(0.4,0,1,1)]'
                  : 'grid-cols-[1fr] grid-rows-[1fr] opacity-100 duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] delay-[120ms]'
              }`}
            >
              <span className="min-h-0 min-w-0 whitespace-nowrap text-[12.5px] font-medium tracking-tightish">
                Collapse
              </span>
            </div>
          </button>

          <ThemeToggle collapsed={collapsed} />

          {/* HIPAA */}
          <div
            className={`mt-1 flex items-center rounded-md ${
              collapsed ? 'justify-center gap-0 p-2' : 'gap-2.5 px-2.5 py-2'
            }`}
            title="Cross-doctor view — all actions audit-logged per HIPAA. BAA on file."
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 flex-shrink-0 text-signal-done"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" strokeLinejoin="round" />
              <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div
              className={`grid overflow-hidden transition-[grid-template-rows,grid-template-columns,opacity] ${
                collapsed
                  ? 'grid-cols-[0fr] grid-rows-[0fr] opacity-0 duration-150 ease-[cubic-bezier(0.4,0,1,1)]'
                  : 'grid-cols-[1fr] grid-rows-[1fr] opacity-100 duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] delay-[140ms]'
              }`}
            >
              <div className="min-h-0 min-w-0 whitespace-nowrap leading-tight">
                <div className="text-[10.5px] font-semibold text-ink">Audit-logged</div>
                <div className="text-[9.5px] text-smoke">Cross-doctor · HIPAA</div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main
        className={`min-h-screen px-4 py-6 transition-[padding] md:px-8 md:py-8 ${
          collapsed
            ? 'pl-20 duration-150 ease-[cubic-bezier(0.4,0,1,1)] md:pl-24'
            : 'pl-[17rem] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] md:pl-72'
        }`}
      >
        <div className="mx-auto max-w-7xl animate-fade-in">{children}</div>
      </main>
      <IdleWarning initialExpiresAt={sessionExpiresAt ?? null} />
    </div>
  );
}
