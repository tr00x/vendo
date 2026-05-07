'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Idle-session warning modal. Renders nothing until the session is within
 * `WARN_BEFORE_MS` of expiring; then shows a modal with a live countdown
 * and a "Stay logged in" button that POSTs to /api/auth/touch to extend
 * the session.
 *
 * Background activity-bumping: while the user is actively interacting with
 * the page (mouse, keyboard, scroll, touch), we silently call /api/auth/touch
 * at most once per `TOUCH_THROTTLE_MS` so the session doesn't expire under
 * an active user. The warning modal only appears when the user is genuinely
 * idle (no input in TOUCH_THROTTLE_MS + buffer).
 */
const WARN_BEFORE_MS = 90_000;          // show modal 90s before expiry
const TICK_MS = 1_000;
const TOUCH_THROTTLE_MS = 120_000;      // silently bump at most every 2 min
const ACTIVE_BUMP_THRESHOLD_MS = 600_000; // start bumping when < 10 min left

interface Props {
  initialExpiresAt: number | null;
}

export function IdleWarning({ initialExpiresAt }: Props) {
  const [expiresAt, setExpiresAt] = useState<number | null>(initialExpiresAt);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastTouchRef = useRef<number>(Date.now());
  const expiresAtRef = useRef<number | null>(initialExpiresAt);

  // Keep ref in sync so activity handlers see latest expiry without re-binding.
  useEffect(() => {
    expiresAtRef.current = expiresAt;
  }, [expiresAt]);

  const silentTouch = useCallback(async () => {
    try {
      const resp = await fetch('/api/auth/touch', { method: 'POST', credentials: 'include' });
      if (!resp.ok) return;
      const data = (await resp.json()) as { expiresAt?: number | null };
      if (typeof data.expiresAt === 'number') setExpiresAt(data.expiresAt);
    } catch {
      // network blip — next activity will retry
    }
  }, []);

  // Activity listeners — throttled. Only bump when expiry is actually
  // approaching, otherwise it's wasted requests.
  useEffect(() => {
    function handleActivity() {
      const now = Date.now();
      if (now - lastTouchRef.current < TOUCH_THROTTLE_MS) return;
      const exp = expiresAtRef.current;
      if (!exp) return;
      const remaining = exp - now;
      if (remaining > ACTIVE_BUMP_THRESHOLD_MS) return; // plenty of time, don't bother
      if (remaining <= 0) return;
      lastTouchRef.current = now;
      void silentTouch();
    }
    const events: Array<keyof DocumentEventMap> = [
      'mousemove', 'keydown', 'click', 'scroll', 'touchstart',
    ];
    for (const ev of events) document.addEventListener(ev, handleActivity, { passive: true });
    return () => {
      for (const ev of events) document.removeEventListener(ev, handleActivity);
    };
  }, [silentTouch]);

  const tick = useCallback(() => {
    if (!expiresAt) {
      setSecondsLeft(null);
      return;
    }
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      window.location.reload();
      return;
    }
    setSecondsLeft(remaining <= WARN_BEFORE_MS ? Math.ceil(remaining / 1000) : null);
  }, [expiresAt]);

  useEffect(() => {
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [tick]);

  async function stayLoggedIn() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const resp = await fetch('/api/auth/touch', { method: 'POST', credentials: 'include' });
      if (!resp.ok) {
        window.location.reload();
        return;
      }
      const data = (await resp.json()) as { expiresAt?: number | null };
      if (typeof data.expiresAt === 'number') setExpiresAt(data.expiresAt);
      setSecondsLeft(null);
      lastTouchRef.current = Date.now();
    } finally {
      setRefreshing(false);
    }
  }

  if (secondsLeft == null) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-cta/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-md border border-hairline bg-paper p-6 shadow-xl">
        <h2 id="idle-title" className="text-[15.5px] font-semibold tracking-tightish text-ink">
          Your session is about to expire
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-graphite">
          For your security, you&apos;ll be signed out in{' '}
          <strong className="font-semibold text-ink tabular">{secondsLeft}s</strong>.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => window.location.assign('/login')}
            className="btn-secondary"
          >
            Sign out now
          </button>
          <button
            type="button"
            onClick={() => void stayLoggedIn()}
            disabled={refreshing}
            aria-busy={refreshing}
            className="btn-primary"
          >
            {refreshing ? 'Extending…' : 'Stay logged in'}
          </button>
        </div>
      </div>
    </div>
  );
}
