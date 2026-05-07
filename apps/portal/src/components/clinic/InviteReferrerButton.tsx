'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertCircleIcon, PlusIcon, SparkleIcon, XIcon } from '@/components/ui/icons';
import { inviteReferrerAction } from './referrer-actions';
import type { InviteReferrerResult } from './referrer-types';

// Mirror of the server-side schema, kept loose where the server normalizes.
// Password rule (min 12) matches the server so the form blocks before
// hitting the action.
const formSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80, 'Too long'),
  lastName: z.string().trim().min(1, 'Last name is required').max(80, 'Too long'),
  email: z.string().trim().email('Enter a valid email').max(254),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Too long'),
  phone: z.string().trim().max(40, 'Too long').optional().or(z.literal('')),
  practice: z.string().trim().max(200, 'Too long').optional().or(z.literal('')),
});
type FormValues = z.infer<typeof formSchema>;

function generateStrongPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < buf.length; i++) out += alphabet[buf[i]! % alphabet.length];
  return out;
}

export function InviteReferrerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const fid = useId();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', phone: '', practice: '' },
  });
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = form;

  function close() {
    setOpen(false);
    setServerError(null);
    setShowPassword(false);
    reset();
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result: InviteReferrerResult = await inviteReferrerAction(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    toast.success(`Invited ${values.firstName} ${values.lastName}`, {
      description: `${values.email} can sign in with the password you set.`,
    });
    close();
    router.refresh();
  }

  function generate() {
    const pw = generateStrongPassword();
    setValue('password', pw, { shouldValidate: true, shouldDirty: true });
    setShowPassword(true);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <PlusIcon className="h-4 w-4" />
        Invite referrer
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${fid}-title`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-cta/40 p-4 backdrop-blur-sm animate-fade-in"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-hairline bg-paper shadow-xl animate-slide-up"
          >
            <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-3.5">
              <div>
                <h3 id={`${fid}-title`} className="text-[15.5px] font-semibold tracking-tightish text-ink">
                  Invite a referring physician
                </h3>
                <p className="mt-0.5 text-[12.5px] text-smoke">
                  Pick or generate a password — give it to the new user directly.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded p-1 text-smoke hover:bg-hairline/60 hover:text-ink"
                aria-label="Close"
                title="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <form
                id={`${fid}-form`}
                onSubmit={(e) => void handleSubmit(onSubmit)(e)}
                className="space-y-3.5"
                noValidate
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`${fid}-fn`} className="label">First name</label>
                    <input
                      id={`${fid}-fn`}
                      autoFocus
                      autoComplete="off"
                      {...register('firstName')}
                      className={`input ${errors.firstName ? 'input-error' : ''}`}
                    />
                    {errors.firstName && (
                      <p className="err" role="alert">
                        <AlertCircleIcon className="h-3.5 w-3.5" />
                        {errors.firstName.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`${fid}-ln`} className="label">Last name</label>
                    <input
                      id={`${fid}-ln`}
                      autoComplete="off"
                      {...register('lastName')}
                      className={`input ${errors.lastName ? 'input-error' : ''}`}
                    />
                    {errors.lastName && (
                      <p className="err" role="alert">
                        <AlertCircleIcon className="h-3.5 w-3.5" />
                        {errors.lastName.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor={`${fid}-em`} className="label">Email</label>
                  <input
                    id={`${fid}-em`}
                    type="email"
                    autoComplete="off"
                    placeholder="dr.lastname@practice.example"
                    {...register('email')}
                    className={`input ${errors.email ? 'input-error' : ''}`}
                  />
                  {errors.email && (
                    <p className="err" role="alert">
                      <AlertCircleIcon className="h-3.5 w-3.5" />
                      {errors.email.message}
                    </p>
                  )}
                  <p className="help">Used as the username for sign-in.</p>
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor={`${fid}-pw`} className="label">Initial password</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-[11.5px] font-medium text-graphite transition hover:text-ink"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="flex items-stretch gap-2">
                    <input
                      id={`${fid}-pw`}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Min 12 characters"
                      {...register('password')}
                      className={`input flex-1 ${errors.password ? 'input-error' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={generate}
                      className="btn-secondary px-3"
                      title="Generate a strong 16-char password"
                    >
                      <SparkleIcon className="h-3.5 w-3.5" />
                      Generate
                    </button>
                  </div>
                  {errors.password ? (
                    <p className="err" role="alert">
                      <AlertCircleIcon className="h-3.5 w-3.5" />
                      {errors.password.message}
                    </p>
                  ) : (
                    <p className="help">
                      Hand it over directly — never email passwords. The user can change it under Account.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={`${fid}-ph`} className="label">
                    Phone <span className="font-normal text-smoke">(optional)</span>
                  </label>
                  <input
                    id={`${fid}-ph`}
                    type="tel"
                    autoComplete="off"
                    placeholder="(555) 010-0142"
                    {...register('phone')}
                    className={`input ${errors.phone ? 'input-error' : ''}`}
                  />
                  {errors.phone && (
                    <p className="err" role="alert">
                      <AlertCircleIcon className="h-3.5 w-3.5" />
                      {errors.phone.message}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={`${fid}-pr`} className="label">
                    Practice <span className="font-normal text-smoke">(optional)</span>
                  </label>
                  <input
                    id={`${fid}-pr`}
                    autoComplete="off"
                    placeholder="Springfield Family Practice (Internal Medicine)"
                    {...register('practice')}
                    className={`input ${errors.practice ? 'input-error' : ''}`}
                  />
                  {errors.practice && (
                    <p className="err" role="alert">
                      <AlertCircleIcon className="h-3.5 w-3.5" />
                      {errors.practice.message}
                    </p>
                  )}
                  <p className="help">Shown on referrals and the inbox sidebar.</p>
                </div>

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

            <footer className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-hairline px-5 py-3">
              <button type="button" onClick={close} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" form={`${fid}-form`} disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Creating…' : 'Create account'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
