'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircleIcon, CheckCircleIcon, MailIcon } from '@/components/ui/icons';

const formSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  acceptedTerms: z
    .boolean()
    .refine((v) => v === true, { message: 'You must accept the Privacy Notice and Terms to continue' }),
});
type FormValues = z.infer<typeof formSchema>;

interface ErrorBody {
  error?: string;
}

export function MagicLinkForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', acceptedTerms: false },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const res = await fetch('/api/auth/magic/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
          acceptedTerms: values.acceptedTerms,
        }),
      });
      if (res.ok) {
        // Server returns 200 regardless of whether the email maps to an
        // account, to avoid user-enumeration. Confirmation copy
        // matches the same neutral framing.
        setSubmittedEmail(values.email);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as ErrorBody;
      setServerError(body.error ?? 'Could not send the link. Please try again.');
    } catch {
      setServerError('Network error. Please try again.');
    }
  }

  if (submittedEmail) {
    return (
      <div className="rounded-md border border-hairline bg-paper p-6 shadow-sm dark:shadow-none">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-md bg-signal-go/10 p-2 text-signal-go">
            <CheckCircleIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold tracking-tightish text-ink">Check your inbox</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-graphite">
              If <strong className="font-semibold text-ink">{submittedEmail}</strong> is on file, we've sent a one-tap sign-in link. It expires in 30 minutes.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-smoke">
          Didn't get it? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={() => setSubmittedEmail(null)}
            className="font-medium text-accent transition hover:underline"
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-hairline bg-paper p-6 shadow-sm dark:shadow-none">
      <h2 className="mb-1 text-[18px] font-semibold tracking-tightish text-ink">Email me a sign-in link</h2>
      <p className="mb-5 text-[13.5px] leading-relaxed text-smoke">
        We'll send a one-tap link to your inbox — no password needed.
      </p>

      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="magic-email" className="label">
            Email address
          </label>
          <div className="relative">
            <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ash" />
            <input
              id="magic-email"
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

        <label className="flex items-start gap-2 text-[13px] text-graphite">
          <input
            type="checkbox"
            {...register('acceptedTerms')}
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-hairline text-cta focus:ring-cta/20"
            aria-describedby={errors.acceptedTerms ? 'magic-terms-error' : undefined}
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
          <p id="magic-terms-error" className="err" role="alert">
            <AlertCircleIcon className="h-3.5 w-3.5" />
            {errors.acceptedTerms.message}
          </p>
        )}

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? 'Sending…' : 'Send sign-in link'}
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
    </div>
  );
}
