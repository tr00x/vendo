'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { IdleWarning } from '@/components/auth/IdleWarning';

interface Props {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userPractice: string;
  pendingCount: number;
  /** epoch-ms timestamp of session idle expiry — passed from server. */
  sessionExpiresAt?: number | null;
}

const STORAGE_KEY = 'vendo.sidebar.collapsed';

export function Shell({ children, userName, userEmail, userPractice, pendingCount, sessionExpiresAt }: Props) {
  // Default to collapsed — first-time users see a clean canvas, sidebar one
  // click away. Users who explicitly expand have their choice remembered.
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === '0') setCollapsed(false);
    } catch {}
  }, []);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-bone">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        userName={userName}
        userEmail={userEmail}
        userPractice={userPractice}
        pendingCount={pendingCount}
      />
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
