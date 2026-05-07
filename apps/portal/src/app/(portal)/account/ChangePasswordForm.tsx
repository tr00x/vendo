'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { changePasswordAction } from './actions';
import { AlertCircleIcon, CheckIcon } from '@/components/ui/icons';

export function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showNew, setShowNew] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!oldPw) next.oldPw = 'Enter your current password.';
    if (!newPw) next.newPw = 'Enter a new password.';
    else if (newPw.length < 8) next.newPw = 'Use at least 8 characters.';
    else if (newPw === oldPw) next.newPw = 'New password must differ from the current one.';
    if (newPw !== confirmPw) next.confirmPw = "Doesn't match the new password.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setBusy(true);
    const r = await changePasswordAction(oldPw, newPw);
    setBusy(false);
    if (r.ok) {
      toast.success('Password updated', {
        description: 'Use your new password the next time you sign in.',
      });
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
      setOpen(false);
    } else {
      toast.error('Could not update password', { description: r.error });
      if (r.error && /current password is incorrect/i.test(r.error)) {
        setErrors({ oldPw: r.error });
      }
    }
  }

  // Lightweight strength heuristic — purely client-side hint, server enforces ≥8.
  const strength = scoreStrength(newPw);

  if (!open) {
    return (
      <div className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold tracking-tightish text-ink">Password</div>
          <p className="mt-1 text-[12.5px] leading-snug text-smoke">
            Change the password you use to sign in. You&apos;ll need your current password to confirm.
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-graphite">
            <span className="font-medium text-ink">Forgot it? </span>
            Sign out and use the &quot;Forgot password&quot; link on the login page — we&apos;ll email you a reset link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-secondary flex-shrink-0"
        >
          Change password
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="px-6 py-5"
    >
      <div className="mb-4">
        <div className="text-[14px] font-semibold tracking-tightish text-ink">Change password</div>
        <p className="mt-1 text-[12.5px] text-smoke">
          Pick something you can remember but a stranger couldn&apos;t guess.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="oldPw">Current password</label>
          <input
            id="oldPw"
            type="password"
            autoComplete="current-password"
            value={oldPw}
            onChange={(e) => {
              setOldPw(e.target.value);
              if (errors.oldPw) setErrors({ ...errors, oldPw: '' });
            }}
            className={`input ${errors.oldPw ? 'input-error' : ''}`}
            disabled={busy}
          />
          {errors.oldPw && (
            <p className="err">
              <AlertCircleIcon className="h-3.5 w-3.5" />
              {errors.oldPw}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="label" htmlFor="newPw">New password</label>
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="text-[11.5px] font-medium text-graphite hover:text-ink"
            >
              {showNew ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            id="newPw"
            type={showNew ? 'text' : 'password'}
            autoComplete="new-password"
            value={newPw}
            onChange={(e) => {
              setNewPw(e.target.value);
              if (errors.newPw) setErrors({ ...errors, newPw: '' });
            }}
            className={`input ${errors.newPw ? 'input-error' : ''}`}
            disabled={busy}
          />
          {errors.newPw ? (
            <p className="err">
              <AlertCircleIcon className="h-3.5 w-3.5" />
              {errors.newPw}
            </p>
          ) : newPw ? (
            <StrengthMeter score={strength} />
          ) : (
            <p className="help">At least 8 characters. Mixing letters, numbers, and symbols makes it stronger.</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="confirmPw">Confirm new password</label>
          <input
            id="confirmPw"
            type={showNew ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPw}
            onChange={(e) => {
              setConfirmPw(e.target.value);
              if (errors.confirmPw) setErrors({ ...errors, confirmPw: '' });
            }}
            className={`input ${errors.confirmPw ? 'input-error' : ''}`}
            disabled={busy}
          />
          {errors.confirmPw && (
            <p className="err">
              <AlertCircleIcon className="h-3.5 w-3.5" />
              {errors.confirmPw}
            </p>
          )}
          {!errors.confirmPw && confirmPw && confirmPw === newPw && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-emerald-700">
              <CheckIcon className="h-3 w-3" />
              Passwords match
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-hairline pt-4 sm:flex-row sm:justify-end sm:gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setOldPw('');
            setNewPw('');
            setConfirmPw('');
            setErrors({});
          }}
          className="btn-secondary"
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}

function scoreStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}

function StrengthMeter({ score }: { score: 0 | 1 | 2 | 3 | 4 }) {
  const labels = ['Too short', 'Weak', 'Okay', 'Strong', 'Very strong'];
  const colors = ['bg-hairline', 'bg-signal-stop', 'bg-amber-500', 'bg-accent', 'bg-emerald-500'];
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < score ? colors[score] : 'bg-hairline'}`}
            aria-hidden
          />
        ))}
      </div>
      <p className="mt-1 text-[11.5px] text-smoke">
        Strength: <span className="font-medium text-graphite">{labels[score]}</span>
      </p>
    </div>
  );
}
