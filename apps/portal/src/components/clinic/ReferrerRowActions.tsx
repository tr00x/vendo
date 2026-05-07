'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  AlertCircleIcon,
  EditIcon,
  KeyIcon,
  MailIcon,
  MoreVerticalIcon,
  SparkleIcon,
  UserCheckIcon,
  UserMinusIcon,
  XIcon,
} from '@/components/ui/icons';
import {
  deactivateReferrerAction,
  reactivateReferrerAction,
  resetReferrerPasswordAction,
  sendMagicLinkAction,
  updateReferrerAction,
} from './referrer-actions';

interface RowProps {
  practitionerId: string;
  active: boolean;
  fullName: string;
  email: string | undefined;
  initial: {
    firstName: string;
    lastName: string;
    phone: string;
    practice: string;
  };
}

function generateStrongPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < buf.length; i++) out += alphabet[buf[i]! % alphabet.length];
  return out;
}

type Modal = 'edit' | 'password' | 'magic' | 'deactivate' | 'reactivate' | null;

export function ReferrerRowActions(props: RowProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside / Escape to close the dropdown — modals close themselves.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      if (e.target instanceof Node && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function open(m: Exclude<Modal, null>) {
    setMenuOpen(false);
    setModal(m);
  }

  function close() {
    setModal(null);
    router.refresh();
  }

  return (
    <>
      <div className="relative inline-block text-left" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded p-1.5 text-smoke hover:bg-hairline/60 hover:text-ink"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Actions for ${props.fullName}`}
          title="Actions"
        >
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-md border border-hairline bg-paper shadow-lg animate-fade-in"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => open('edit')}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-bone"
            >
              <EditIcon className="h-3.5 w-3.5 text-smoke" />
              Edit details
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => open('password')}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-bone"
            >
              <KeyIcon className="h-3.5 w-3.5 text-smoke" />
              Reset password
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => open('magic')}
              disabled={!props.active || !props.email}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-bone disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              title={
                !props.active
                  ? 'Reactivate the account first'
                  : !props.email
                  ? 'No email on file for this referrer'
                  : 'Email a one-tap sign-in link'
              }
            >
              <MailIcon className="h-3.5 w-3.5 text-smoke" />
              Send sign-in link
            </button>
            {props.active ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => open('deactivate')}
                className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-[13px] text-signal-stop hover:bg-signal-stop/5"
              >
                <UserMinusIcon className="h-3.5 w-3.5" />
                Deactivate access
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => open('reactivate')}
                className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-[13px] text-ink hover:bg-bone"
              >
                <UserCheckIcon className="h-3.5 w-3.5 text-smoke" />
                Reactivate
              </button>
            )}
          </div>
        )}
      </div>

      {modal === 'edit' && (
        <EditModal
          practitionerId={props.practitionerId}
          email={props.email}
          initial={props.initial}
          onClose={close}
        />
      )}
      {modal === 'password' && (
        <PasswordModal
          practitionerId={props.practitionerId}
          fullName={props.fullName}
          onClose={close}
        />
      )}
      {modal === 'magic' && (
        <MagicLinkModal
          practitionerId={props.practitionerId}
          fullName={props.fullName}
          email={props.email ?? ''}
          onClose={close}
        />
      )}
      {modal === 'deactivate' && (
        <DeactivateModal
          practitionerId={props.practitionerId}
          fullName={props.fullName}
          onClose={close}
        />
      )}
      {modal === 'reactivate' && (
        <ReactivateModal
          practitionerId={props.practitionerId}
          fullName={props.fullName}
          onClose={close}
        />
      )}
    </>
  );
}

// ---------- Edit modal ----------

const editSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80, 'Too long'),
  lastName: z.string().trim().min(1, 'Last name is required').max(80, 'Too long'),
  phone: z.string().trim().max(40, 'Too long').optional().or(z.literal('')),
  practice: z.string().trim().max(200, 'Too long').optional().or(z.literal('')),
});
type EditValues = z.infer<typeof editSchema>;

function EditModal({
  practitionerId,
  email,
  initial,
  onClose,
}: {
  practitionerId: string;
  email: string | undefined;
  initial: RowProps['initial'];
  onClose: () => void;
}) {
  const fid = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: initial,
  });

  async function onSubmit(values: EditValues) {
    setServerError(null);
    const result = await updateReferrerAction({
      practitionerId,
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone || '',
      practice: values.practice || '',
    });
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    toast.success('Referrer updated');
    onClose();
  }

  return (
    <ModalShell title="Edit referrer" subtitle={email} onClose={onClose} formId={`${fid}-form`} submitLabel="Save changes" busy={isSubmitting}>
      <form id={`${fid}-form`} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3.5" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${fid}-fn`} className="label">First name</label>
            <input id={`${fid}-fn`} autoFocus {...register('firstName')} className={`input ${errors.firstName ? 'input-error' : ''}`} />
            {errors.firstName && <FieldErr msg={errors.firstName.message} />}
          </div>
          <div>
            <label htmlFor={`${fid}-ln`} className="label">Last name</label>
            <input id={`${fid}-ln`} {...register('lastName')} className={`input ${errors.lastName ? 'input-error' : ''}`} />
            {errors.lastName && <FieldErr msg={errors.lastName.message} />}
          </div>
        </div>
        <div>
          <label htmlFor={`${fid}-ph`} className="label">
            Phone <span className="font-normal text-smoke">(optional)</span>
          </label>
          <input id={`${fid}-ph`} type="tel" {...register('phone')} className={`input ${errors.phone ? 'input-error' : ''}`} />
          {errors.phone && <FieldErr msg={errors.phone.message} />}
        </div>
        <div>
          <label htmlFor={`${fid}-pr`} className="label">
            Practice <span className="font-normal text-smoke">(optional)</span>
          </label>
          <input id={`${fid}-pr`} {...register('practice')} className={`input ${errors.practice ? 'input-error' : ''}`} />
          {errors.practice && <FieldErr msg={errors.practice.message} />}
          <p className="help">Email is the sign-in identity and cannot be edited here.</p>
        </div>
        {serverError && <ServerErr msg={serverError} />}
      </form>
    </ModalShell>
  );
}

// ---------- Password modal ----------

const passwordSchema = z.object({
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Too long'),
});
type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordModal({
  practitionerId,
  fullName,
  onClose,
}: {
  practitionerId: string;
  fullName: string;
  onClose: () => void;
}) {
  const fid = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '' },
  });

  async function onSubmit(values: PasswordValues) {
    setServerError(null);
    const result = await resetReferrerPasswordAction({ practitionerId, password: values.password });
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    toast.success(`Password reset for ${fullName}`, {
      description: 'Hand the new password over directly — never email.',
    });
    onClose();
  }

  function generate() {
    const pw = generateStrongPassword();
    setValue('password', pw, { shouldValidate: true, shouldDirty: true });
    setShow(true);
  }

  return (
    <ModalShell
      title="Reset password"
      subtitle={fullName}
      onClose={onClose}
      formId={`${fid}-form`}
      submitLabel="Reset password"
      busy={isSubmitting}
    >
      <form id={`${fid}-form`} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3.5" noValidate>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor={`${fid}-pw`} className="label">New password</label>
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="text-[11.5px] font-medium text-graphite transition hover:text-ink"
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="flex items-stretch gap-2">
            <input
              id={`${fid}-pw`}
              autoFocus
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Min 12 characters"
              {...register('password')}
              className={`input flex-1 ${errors.password ? 'input-error' : ''}`}
            />
            <button type="button" onClick={generate} className="btn-secondary px-3" title="Generate a strong 16-char password">
              <SparkleIcon className="h-3.5 w-3.5" />
              Generate
            </button>
          </div>
          {errors.password ? (
            <FieldErr msg={errors.password.message} />
          ) : (
            <p className="help">The user&apos;s active sessions stay valid until they sign out, but their existing password stops working immediately.</p>
          )}
        </div>
        {serverError && <ServerErr msg={serverError} />}
      </form>
    </ModalShell>
  );
}

// ---------- Deactivate modal ----------

function DeactivateModal({
  practitionerId,
  fullName,
  onClose,
}: {
  practitionerId: string;
  fullName: string;
  onClose: () => void;
}) {
  const fid = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setServerError(null);
    const result = await deactivateReferrerAction({ practitionerId });
    setBusy(false);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    toast.success(`${fullName} deactivated`, {
      description: 'Their password has been rotated; sign-in is blocked.',
    });
    onClose();
  }

  return (
    <ModalShell
      title="Deactivate referrer"
      subtitle={fullName}
      onClose={onClose}
      formId={`${fid}-form`}
      submitLabel={busy ? 'Deactivating…' : 'Deactivate'}
      submitVariant="danger"
      submitOnClick={() => void confirm()}
      busy={busy}
    >
      <div className="space-y-3 text-[13px] text-graphite">
        <p>
          {fullName} will lose portal access immediately. Past referrals stay associated with the account
          and remain visible.
        </p>
        <p>
          You can re-activate later by setting a new password — sign-in will resume on the next login.
        </p>
        {serverError && <ServerErr msg={serverError} />}
      </div>
    </ModalShell>
  );
}

// ---------- Reactivate modal ----------

function ReactivateModal({
  practitionerId,
  fullName,
  onClose,
}: {
  practitionerId: string;
  fullName: string;
  onClose: () => void;
}) {
  const fid = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '' },
  });

  async function onSubmit(values: PasswordValues) {
    setServerError(null);
    const result = await reactivateReferrerAction({ practitionerId, password: values.password });
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    toast.success(`${fullName} reactivated`, {
      description: 'Hand the new password over directly.',
    });
    onClose();
  }

  function generate() {
    const pw = generateStrongPassword();
    setValue('password', pw, { shouldValidate: true, shouldDirty: true });
    setShow(true);
  }

  return (
    <ModalShell
      title="Reactivate referrer"
      subtitle={fullName}
      onClose={onClose}
      formId={`${fid}-form`}
      submitLabel="Reactivate"
      busy={isSubmitting}
    >
      <form id={`${fid}-form`} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3.5" noValidate>
        <p className="text-[13px] text-graphite">Set a new initial password and restore access.</p>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor={`${fid}-pw`} className="label">New password</label>
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="text-[11.5px] font-medium text-graphite transition hover:text-ink"
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="flex items-stretch gap-2">
            <input
              id={`${fid}-pw`}
              autoFocus
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Min 12 characters"
              {...register('password')}
              className={`input flex-1 ${errors.password ? 'input-error' : ''}`}
            />
            <button type="button" onClick={generate} className="btn-secondary px-3" title="Generate a strong 16-char password">
              <SparkleIcon className="h-3.5 w-3.5" />
              Generate
            </button>
          </div>
          {errors.password && <FieldErr msg={errors.password.message} />}
        </div>
        {serverError && <ServerErr msg={serverError} />}
      </form>
    </ModalShell>
  );
}

// ---------- Magic-link modal ----------

function MagicLinkModal({
  practitionerId,
  fullName,
  email,
  onClose,
}: {
  practitionerId: string;
  fullName: string;
  email: string;
  onClose: () => void;
}) {
  const fid = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setServerError(null);
    const result = await sendMagicLinkAction({ practitionerId });
    setBusy(false);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    toast.success(`Sign-in link sent to ${result.email}`, {
      description: 'The link expires in 30 minutes and can only be used once.',
    });
    onClose();
  }

  return (
    <ModalShell
      title="Send sign-in link"
      subtitle={fullName}
      onClose={onClose}
      formId={`${fid}-form`}
      submitLabel={busy ? 'Sending…' : 'Send link'}
      submitOnClick={() => void confirm()}
      busy={busy}
    >
      <div className="space-y-3 text-left text-[13px] leading-relaxed text-graphite">
        <p>
          We&apos;ll email a one-tap sign-in link.
        </p>
        {email && (
          <p className="break-all rounded-md bg-bone px-3 py-2 font-mono text-[12.5px] text-ink">
            {email}
          </p>
        )}
        <p className="text-smoke">
          The link expires in 30 minutes and can only be used once.
        </p>
        <p className="text-smoke">
          Heads up — clicking the link rotates this user&apos;s password. If they had a
          password you set earlier, it will stop working. Use <em>Reset password</em> if
          you need both.
        </p>
        {serverError && <ServerErr msg={serverError} />}
      </div>
    </ModalShell>
  );
}

// ---------- shared modal shell ----------

function ModalShell({
  title,
  subtitle,
  onClose,
  formId,
  submitLabel,
  submitVariant,
  submitOnClick,
  busy,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  onClose: () => void;
  formId: string;
  submitLabel: string;
  submitVariant?: 'danger';
  submitOnClick?: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  const submitClass =
    submitVariant === 'danger'
      ? 'inline-flex items-center justify-center gap-1.5 rounded-md bg-signal-stop px-3.5 py-1.5 text-[13px] font-medium text-paper shadow-sm transition hover:bg-signal-stop/90 disabled:opacity-50'
      : 'btn-primary';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-cta/40 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-hairline bg-paper shadow-xl animate-slide-up"
      >
        <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div>
            <h3 className="text-[15.5px] font-semibold tracking-tightish text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-smoke">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-smoke hover:bg-hairline/60 hover:text-ink"
            aria-label="Close"
            title="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <footer className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-hairline px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          {submitOnClick ? (
            <button type="button" onClick={submitOnClick} disabled={busy} className={submitClass}>
              {submitLabel}
            </button>
          ) : (
            <button type="submit" form={formId} disabled={busy} className={submitClass}>
              {busy ? 'Working…' : submitLabel}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function FieldErr({ msg }: { msg: string | undefined }) {
  return (
    <p className="err" role="alert">
      <AlertCircleIcon className="h-3.5 w-3.5" />
      {msg ?? 'Invalid value'}
    </p>
  );
}

function ServerErr({ msg }: { msg: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-signal-stop/30 bg-signal-stop/5 p-3 text-[13px] text-signal-stop">
      <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>{msg}</span>
    </div>
  );
}
