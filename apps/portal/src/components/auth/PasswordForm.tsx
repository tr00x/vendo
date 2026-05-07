'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircleIcon, MailIcon, ShieldIcon } from '@/components/ui/icons';
import { BRAND } from '@/lib/branding';

const formSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  acceptedTerms: z
    .boolean()
    .refine((v) => v === true, { message: 'You must accept the Privacy Notice and Terms to continue' }),
});
type FormValues = z.infer<typeof formSchema>;

interface ErrorBody {
  error?: string;
  retryAfterMs?: number;
}

function formatRetry(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  return m <= 1 ? 'a minute' : `${m} minutes`;
}

export function PasswordForm({ next }: { next: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '', acceptedTerms: false },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          acceptedTerms: values.acceptedTerms,
        }),
      });
      if (res.ok) {
        window.location.assign(next);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as ErrorBody;
      if (res.status === 423 && body.retryAfterMs) {
        setServerError(
          `${body.error ?? 'Account locked.'} Try again in about ${formatRetry(body.retryAfterMs)}.`,
        );
      } else {
        setServerError(body.error ?? 'Sign-in failed. Please try again.');
      }
    } catch {
      setServerError('Network error. Please try again.');
    }
  }

  return (
    <div className="rounded-md border border-hairline bg-paper p-6 shadow-sm dark:shadow-none">
      <h2 className="mb-1 text-[18px] font-semibold tracking-tightish text-ink">Sign in</h2>
      <p className="mb-5 text-[13.5px] leading-relaxed text-smoke">
        Enter your email and password to access the referral portal.
      </p>

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">
            Email address
          </label>
          <div className="relative">
            <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ash" />
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              placeholder="you@yourpractice.com"
              {...register('email')}
              className={`input pl-9 ${errors.email ? 'input-error' : ''}`}
            />
          </div>
          {errors.email && (
            <p className="err" role="alert">
              <AlertCircleIcon className="h-3.5 w-3.5" />
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="label">
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="text-[11.5px] font-medium text-graphite transition hover:text-ink"
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="relative">
            <ShieldIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ash" />
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              className={`input pl-9 ${errors.password ? 'input-error' : ''}`}
            />
          </div>
          {errors.password && (
            <p className="err" role="alert">
              <AlertCircleIcon className="h-3.5 w-3.5" />
              {errors.password.message}
            </p>
          )}
        </div>

        <label className="flex items-start gap-2 text-[13px] text-graphite">
          <input
            type="checkbox"
            {...register('acceptedTerms')}
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-hairline text-cta focus:ring-cta/20"
            aria-describedby={errors.acceptedTerms ? 'terms-error' : undefined}
          />
          <span>
            I agree to the{' '}
            <a
              href="/legal/privacy"
              target="_blank"
              rel="noopener"
              className="font-medium text-accent transition hover:underline"
            >
              Privacy Notice
            </a>{' '}
            and{' '}
            <a
              href="/legal/terms"
              target="_blank"
              rel="noopener"
              className="font-medium text-accent transition hover:underline"
            >
              Terms of Service
            </a>
            .
          </span>
        </label>
        {errors.acceptedTerms && (
          <p id="terms-error" className="err" role="alert">
            <AlertCircleIcon className="h-3.5 w-3.5" />
            {errors.acceptedTerms.message}
          </p>
        )}

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>

        {serverError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-signal-stop/30 bg-signal-stop/5 p-3 text-[13px] text-signal-stop"
          >
            <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{serverError}</span>
          </div>
        )}
      </form>

      <div className="mt-5 border-t border-hairline pt-4">
        <p className="text-center text-[11.5px] leading-relaxed text-smoke">
          New here? Ask your {BRAND.shortName} contact to send you an invitation.
        </p>
      </div>
    </div>
  );
}
