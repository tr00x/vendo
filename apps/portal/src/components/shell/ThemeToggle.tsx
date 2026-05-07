'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vendo.theme';

export function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Apply persisted theme on mount, before paint where possible.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const initial: 'light' | 'dark' =
        stored === 'dark' || stored === 'light'
          ? stored
          : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      setTheme(initial);
      document.documentElement.classList.toggle('dark', initial === 'dark');
    } catch {}
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
      document.documentElement.classList.toggle('dark', next === 'dark');
      return next;
    });
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex items-center rounded-md text-graphite transition hover:bg-hairline/60 hover:text-ink ${
        collapsed ? 'justify-center gap-0 p-2' : 'gap-2.5 px-2.5 py-2'
      }`}
    >
      {/* Icon — sun in dark mode (to switch to light), moon in light mode. */}
      {isDark ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
      <div
        className={`grid overflow-hidden transition-[grid-template-rows,grid-template-columns,opacity] ${
          collapsed
            ? 'grid-cols-[0fr] grid-rows-[0fr] opacity-0 duration-150 ease-[cubic-bezier(0.4,0,1,1)]'
            : 'grid-cols-[1fr] grid-rows-[1fr] opacity-100 duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] delay-[110ms]'
        }`}
      >
        <span className="min-h-0 min-w-0 whitespace-nowrap text-[12.5px] font-medium tracking-tightish">
          {isDark ? 'Light mode' : 'Dark mode'}
        </span>
      </div>
    </button>
  );
}
