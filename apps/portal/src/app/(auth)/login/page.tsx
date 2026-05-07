import { redirect } from 'next/navigation';
import { SignInTabs } from '@/components/auth/SignInTabs';
import { AlertCircleIcon, CheckCircleIcon } from '@/components/ui/icons';
import { peekValidatedSession } from '@/lib/auth/guard';

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  session_expired: 'Your session expired. Please sign in again.',
  unauthorized: 'Please sign in to continue.',
  magic_expired: 'That sign-in link has expired. Request a fresh one below.',
  magic_replayed: 'That sign-in link was already used. Request a fresh one below.',
  magic_invalid: 'That sign-in link is not valid. Request a fresh one below.',
  magic_login_failed: 'Could not finish sign-in from that link. Try again or use a password.',
  magic_sent: 'If that email is on file, a sign-in link has been sent. Check your inbox.',
};

export default async function LoginPage({ searchParams }: PageProps) {
  const { next: rawNext, error } = await searchParams;
  // If the visitor already has a valid (non-expired) session, send them to /r
  // so they don't see the login form again. peekSession returns undefined for
  // missing OR expired sessions, which is exactly what we want — no loop.
  // Strict check: actually call the API with the cached access token. A stale
  // cookie (cookie still valid by timestamp, but the upstream Medplum token
  // already rotated/expired) passes peekSession and creates a redirect loop:
  // /login → /r → requireSession 401 → /login. peekValidatedSession breaks
  // the loop by returning undefined when the API rejects the token, so we
  // render the form instead of bouncing.
  if (await peekValidatedSession()) redirect('/r');
  // Default to /r so the post-login server-side router can send each user
  // to the surface that matches their AccessPolicy role (Referrer → /dashboard,
  // ClinicStaff → /clinic/inbox). Only honor an explicit `next` when the
  // middleware was the one that bounced the user here.
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/r';
  const errorMsg = error ? ERROR_MESSAGES[error] ?? null : null;
  // 'magic_sent' is the success-flavored notice raised by the legacy
  // self-service path; render it as a positive banner instead of an
  // error so the page stays consistent with the in-form confirmation.
  const isPositive = error === 'magic_sent';

  return (
    <>
      {errorMsg && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-md border p-3 text-[13px] ${
            isPositive
              ? 'border-signal-go/30 bg-signal-go/5 text-signal-go'
              : 'border-signal-stop/30 bg-signal-stop/5 text-signal-stop'
          }`}
        >
          {isPositive ? (
            <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          )}
          <span>{errorMsg}</span>
        </div>
      )}
      <SignInTabs next={next} />
    </>
  );
}
