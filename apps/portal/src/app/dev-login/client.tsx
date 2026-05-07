'use client';

import { useState } from 'react';

if (process.env.NODE_ENV === 'production') {
  throw new Error('dev-login client must not load in production');
}

interface DemoUser {
  email: string;
  password: string;
  name: string;
  practice: string;
  emoji: string;
  redirect: string;
  role: 'Referrer' | 'ClinicStaff';
}

const USERS: DemoUser[] = [
  {
    email: 's.smith@familypractice.example',
    password: 'ClinicPass!2026',
    name: 'Dr Sarah Smith, MD',
    practice: 'Family Practice • Internal Medicine',
    emoji: '🩺',
    redirect: '/dashboard',
    role: 'Referrer',
  },
  {
    email: 'm.rodriguez@orthogroup.example',
    password: 'ClinicPass!2026',
    name: 'Dr Marcus Rodriguez, MD',
    practice: 'Orthopedics & Sports Medicine',
    emoji: '🦴',
    redirect: '/dashboard',
    role: 'Referrer',
  },
  {
    email: 'a.okafor@sportsmed.example',
    password: 'ClinicPass!2026',
    name: 'Dr Aisha Okafor, MD',
    practice: 'Sports Medicine Associates',
    emoji: '🏃',
    redirect: '/dashboard',
    role: 'Referrer',
  },
  {
    email: 'd.brown@primarycare.example',
    password: 'ClinicPass!2026',
    name: 'Dr David Brown, DO',
    practice: 'Primary Care',
    emoji: '👨‍⚕️',
    redirect: '/dashboard',
    role: 'Referrer',
  },
  {
    email: 'staff@vendoclinic.local',
    password: 'ClinicPass!2026',
    name: 'Jane Doe',
    practice: 'Vendo Demo Clinic — Front Desk',
    emoji: '🏥',
    redirect: '/clinic/inbox',
    role: 'ClinicStaff',
  },
];

export function DevLoginClient() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loginAs(user: DemoUser) {
    setBusy(user.email);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: user.password, acceptedTerms: true }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      window.location.href = user.redirect;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Dev Login</h1>
          <p className="mt-2 text-sm text-neutral-600">
            One-click sign-in as a seeded demo doctor. Disabled in production.
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>For local browser testing only.</strong> One-click sign-in as a
          seeded demo user. The real sign-in form is at{' '}
          <a href="/login" className="underline">/login</a>.
        </div>

        <div className="mt-6 space-y-3">
          {USERS.map((user) => (
            <button
              key={user.email}
              type="button"
              onClick={() => void loginAs(user)}
              disabled={busy !== null}
              className="flex w-full items-center gap-4 rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-neutral-400 hover:shadow disabled:opacity-50"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-2xl">
                {user.emoji}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-900">{user.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      user.role === 'ClinicStaff'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    {user.role === 'ClinicStaff' ? 'Clinic' : 'Referrer'}
                  </span>
                </div>
                <div className="text-sm text-neutral-600">{user.practice}</div>
                <div className="font-mono text-xs text-neutral-500">{user.email}</div>
              </div>
              <div className="text-sm text-neutral-500">
                {busy === user.email ? 'Signing in…' : 'Sign in →'}
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          >
            <strong>Login failed:</strong> {error}
          </div>
        )}

        <div className="mt-8 rounded-lg bg-neutral-900 p-4 font-mono text-xs text-neutral-300">
          <div className="mb-2 text-neutral-500">// All accounts share the same password</div>
          <div>password: ClinicPass!2026</div>
        </div>
      </div>
    </main>
  );
}
