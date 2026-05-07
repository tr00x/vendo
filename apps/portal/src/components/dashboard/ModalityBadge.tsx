import { modalityMeta } from '@/lib/format';

export function ModalityBadge({ code, size = 'md' }: { code: string | undefined; size?: 'sm' | 'md' }) {
  const m = modalityMeta(code);
  const short = m.code === 'MRI' ? 'MRI' : m.code === 'XRAY' ? 'XR' : m.code === 'ARK' ? 'US' : '—';
  const dim = size === 'sm' ? 'h-9 w-11 text-[11px]' : 'h-10 w-12 text-[12px]';
  return (
    <div
      className={`flex ${dim} flex-shrink-0 items-center justify-center rounded-md font-semibold tracking-tightish ring-1 ring-inset ${m.chipClass}`}
      title={`${m.label} — ${m.description}`}
      aria-label={m.label}
    >
      {short}
    </div>
  );
}
