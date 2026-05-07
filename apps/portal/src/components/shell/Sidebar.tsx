'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  HomeIcon,
  FilePlusIcon,
  UserIcon,
  BellIcon,
} from '@/components/ui/icons';
import { UserMenu } from './UserMenu';
import { ThemeToggle } from './ThemeToggle';
import { BRAND } from '@/lib/branding';

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: (props: { className?: string }) => React.ReactNode;
}

const ITEMS: NavItem[] = [
  { href: '/dashboard',  label: 'Dashboard',    description: 'All your referrals',           icon: HomeIcon },
  { href: '/refer',      label: 'New referral', description: 'Send a patient for imaging',   icon: FilePlusIcon },
  { href: '/account',    label: 'Account',      description: 'Profile, security & support',  icon: UserIcon },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  userName: string;
  userEmail: string;
  userPractice: string;
  pendingCount: number;
}

export function Sidebar({ collapsed, onToggle, userName, userEmail, userPractice, pendingCount }: SidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

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

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-hairline bg-bone transition-[width] ${
        collapsed
          // Closing — fast and decisive. ease-in cubic so width accelerates as it shrinks.
          ? 'w-16 duration-150 ease-[cubic-bezier(0.4,0,1,1)]'
          // Opening — silky expo-out. Width grows fast then eases into final.
          : 'w-64 duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)]'
      }`}
      aria-label="Primary navigation"
      data-collapsed={collapsed}
    >
      {/* Logo / brand */}
      <Link
        href="/dashboard"
        className={`flex flex-shrink-0 items-center border-b border-hairline transition ${
          collapsed ? 'justify-center gap-0 px-2 py-3' : 'gap-2.5 px-3 py-3'
        }`}
        title={BRAND.name}
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
            <div className="text-[10.5px] text-smoke">{BRAND.tagline}</div>
          </div>
        </div>
      </Link>

      {/* Nav */}
      <nav className={`flex flex-1 flex-col gap-1 overflow-y-auto ${collapsed ? 'p-2' : 'p-3'}`}>
        {ITEMS.map((it) => {
          const active = isActive(it.href);
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

      {/* Bottom utility cluster: notifications, user, collapse, HIPAA */}
      <div className="flex flex-shrink-0 flex-col gap-1 border-t border-hairline p-2">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            title={pendingCount === 0 ? 'No pending notifications' : `${pendingCount} pending referral${pendingCount === 1 ? '' : 's'}`}
            className={`group flex w-full items-center rounded-md text-graphite transition hover:bg-hairline/60 hover:text-ink ${
              collapsed ? 'justify-center gap-0 p-2' : 'gap-2.5 px-2.5 py-2'
            }`}
            aria-haspopup="dialog"
            aria-expanded={notifOpen}
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
              className={`absolute bottom-0 mb-1 w-72 overflow-hidden rounded-md border border-hairline bg-paper shadow-lg animate-slide-up ${
                collapsed ? 'left-full ml-2' : 'left-full ml-2'
              }`}
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

        {/* User menu */}
        <div className={collapsed ? 'flex justify-center' : ''}>
          <UserMenu name={userName} email={userEmail} practice={userPractice} variant={collapsed ? 'icon' : 'full'} />
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={onToggle}
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

        {/* HIPAA — small lock indicator */}
        <div
          className={`mt-1 flex items-center rounded-md ${
            collapsed ? 'justify-center gap-0 p-2' : 'gap-2.5 px-2.5 py-2'
          }`}
          title="HIPAA-secure — encrypted end-to-end. Audit-logged. BAA on file."
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
              <div className="text-[10.5px] font-semibold text-ink">HIPAA-secure</div>
              <div className="text-[9.5px] text-smoke">Encrypted · audit-logged</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
