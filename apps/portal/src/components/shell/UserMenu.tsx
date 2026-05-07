'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from './actions';
import { ChevronDownIcon, UserIcon, LogOutIcon } from '@/components/ui/icons';

interface Props {
  name: string;
  email: string;
  practice: string;
  /** 'full' shows avatar + name + chevron (sidebar expanded). 'icon' shows
   *  just the avatar tile (sidebar collapsed). The dropdown content is the
   *  same in both. */
  variant?: 'full' | 'icon';
}

export function UserMenu({ name, email, practice, variant = 'full' }: Props) {
  const pathname = usePathname();
  const isClinic = pathname?.startsWith('/clinic') ?? false;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  // Referrer side: the sidebar already has Account as a top-level nav item,
  // and Account hosts Sign out. The dropdown was pure duplication, so the
  // tile becomes a static identity link to /account. Clinic side has no
  // Account in its sidebar, so the dropdown stays.
  if (!isClinic) {
    return (
      <Link
        href="/account"
        className={`flex items-center rounded-md transition hover:bg-hairline/60 ${
          variant === 'icon' ? 'p-1' : 'w-full gap-2 p-1.5 pr-2'
        }`}
        title={`${name} — open account`}
      >
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-bone text-[11px] font-semibold tracking-tightish text-graphite"
          aria-hidden
        >
          {initials || '?'}
        </span>
        {variant === 'full' && (
          <span className="flex-1 truncate text-left text-[13px] font-medium tracking-tightish text-ink">
            {name}
          </span>
        )}
      </Link>
    );
  }

  return <ClinicUserMenu name={name} email={email} practice={practice} variant={variant} initials={initials} />;
}

function ClinicUserMenu({
  name,
  email,
  practice,
  variant,
  initials,
}: Required<Pick<Props, 'name' | 'email' | 'practice'>> & { variant: 'full' | 'icon'; initials: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center rounded-md transition hover:bg-hairline/60 ${
          variant === 'icon' ? 'p-1' : 'w-full gap-2 p-1.5 pr-2'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={variant === 'icon' ? `${name} — open account menu` : 'Open account menu'}
      >
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-bone text-[11px] font-semibold tracking-tightish text-graphite"
          aria-hidden
        >
          {initials || '?'}
        </span>
        {variant === 'full' && (
          <>
            <span className="flex-1 truncate text-left text-[13px] font-medium tracking-tightish text-ink">
              {name}
            </span>
            <ChevronDownIcon className={`h-3.5 w-3.5 flex-shrink-0 text-smoke transition ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-0 left-full z-50 ml-2 w-72 overflow-hidden rounded-md border border-hairline bg-paper shadow-lg animate-slide-up"
        >
          <div className="border-b border-hairline px-4 py-3.5">
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-bone text-[13px] font-semibold tracking-tightish text-graphite"
                aria-hidden
              >
                {initials || '?'}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold tracking-tightish text-ink">{name}</div>
                <div className="mt-0.5 truncate text-[12px] text-smoke" title={email}>
                  {email}
                </div>
                {practice && (
                  <div className="mt-1 truncate text-[11.5px] text-smoke" title={practice}>
                    {practice}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="py-1">
            <Link
              href="/clinic/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-graphite hover:bg-bone hover:text-ink"
              role="menuitem"
            >
              <UserIcon className="h-3.5 w-3.5 text-smoke" />
              Account settings
            </Link>
            <button
              type="button"
              onClick={() => start(() => signOut())}
              disabled={pending}
              className="flex w-full items-center gap-2.5 border-t border-hairline px-4 py-2 text-[13px] text-graphite transition hover:bg-bone hover:text-signal-stop disabled:opacity-50"
              role="menuitem"
            >
              <LogOutIcon className="h-3.5 w-3.5 text-smoke" />
              {pending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
