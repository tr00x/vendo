'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Props {
  serviceRequestId: string;
  /** Server action that takes (serviceRequestId, text) → result */
  action: (id: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  placeholder: string;
  submitLabel: string;
  successMsg?: string;
  /** Color hint kept for API compatibility — currently both roles use the same ink primary. */
  authorRoleColor?: 'indigo' | 'emerald';
}

export function CommentComposer({
  serviceRequestId,
  action,
  placeholder,
  submitLabel,
  successMsg = 'Comment posted',
}: Props) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await action(serviceRequestId, text.trim());
    setBusy(false);
    if (r.ok) {
      setText('');
      toast.success(successMsg);
      router.refresh();
    } else {
      toast.error('Could not post', { description: r.error });
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="input resize-none"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-smoke">
          Tip: press{' '}
          <kbd className="rounded border border-hairline bg-bone px-1.5 py-0.5 font-mono text-[10.5px] text-graphite">
            ⌘ + Enter
          </kbd>{' '}
          to send
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !text.trim()}
          className="btn-primary"
        >
          {busy ? 'Sending…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
