import Link from 'next/link';
import { BRAND } from '@/lib/branding';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bone px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand block */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            href="/"
            className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-cta text-white"
            aria-hidden
            title={BRAND.name}
          >
            <span className="text-[16px] font-semibold leading-none tracking-tightish">{BRAND.initials}</span>
          </Link>
          <h1 className="text-[22px] font-semibold tracking-tightish text-ink">
            {BRAND.name}
          </h1>
          <p className="mt-1.5 text-[13px] text-smoke">
            {BRAND.tagline}
          </p>
        </div>

        {children}

        <p className="mt-6 text-center text-[12px] text-smoke">
          Need help? Call us at{' '}
          <a
            href={`tel:${BRAND.phoneTel}`}
            className="font-medium text-accent transition hover:underline"
          >
            {BRAND.phone}
          </a>
        </p>
      </div>
    </main>
  );
}
