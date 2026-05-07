import Link from 'next/link';
import type { ComponentType } from 'react';

interface Props {
  title: string;
  description: string;
  cta?: { href: string; label: string; icon?: ComponentType<{ className?: string }> };
}

export function EmptyState({ title, description, cta }: Props) {
  const Icon = cta?.icon;
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-hairline bg-paper px-8 py-16 text-center">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-bone text-smoke">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      </div>
      <h3 className="text-[16px] font-semibold tracking-tightish text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-smoke">
        {description}
      </p>
      {cta && (
        <Link href={cta.href} className="btn-primary mt-5">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {cta.label}
        </Link>
      )}
    </div>
  );
}
