import type { ServiceRequest } from '@medplum/fhirtypes';
import { timeAgo } from '@/lib/format';
import {
  StethoscopeIcon,
  UserIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  FileIcon,
} from '@/components/ui/icons';

export type AuthorRole = 'ClinicStaff' | 'Referrer' | 'System' | 'Unknown';

interface PractitionerInfo {
  name: string;
  role: AuthorRole;
}

interface Entry {
  text: string;
  time: string | undefined;
  role: AuthorRole;
  authorName?: string;
  display: string;
  /** Internal-only — clinic-side handoff context. Never rendered to non-clinic viewers. */
  internal?: boolean;
}

const PACS_LINK_RE = /Images available:\s*(https?:\/\/\S+)/i;
const INTERNAL_PREFIX_RE = /^\[Internal\]\s*/i;

function classify(
  text: string,
  time: string | undefined,
  authorRef: string | undefined,
  authorDisplay: string | undefined,
  roleMap: Map<string, PractitionerInfo>,
): Entry {
  const t = (text ?? '').trim();
  const internal = INTERNAL_PREFIX_RE.test(t);
  const stripped = internal ? t.replace(INTERNAL_PREFIX_RE, '') : t;
  if (PACS_LINK_RE.test(t)) {
    return { text: t, time, role: 'System', display: 'Imaging study link attached' };
  }
  // Trust-on-read: resolve role from Practitioner.identifier (immutable to non-admin users).
  if (authorRef) {
    const id = authorRef.split('/')[1];
    if (id) {
      const info = roleMap.get(id);
      if (info) {
        return { text: t, time, role: info.role, authorName: info.name, display: stripped, internal };
      }
      // Fallback: Practitioner unreachable (deleted, AccessPolicy block) but
      // we have a snapshotted display name on the note itself. Show that
      // name with an "Unverified" role so the timeline doesn't blank out.
      if (authorDisplay && authorDisplay.trim()) {
        return { text: t, time, role: 'Unknown', authorName: authorDisplay.trim(), display: stripped, internal };
      }
    }
  }
  // Legacy entries (no authorReference): keep parsing prefixes for backwards
  // compat but mark as Unknown role so the UI shows them as untrusted.
  if (t.startsWith('[Clinic note · ') || t.startsWith('[Clinic]')) {
    const m = t.match(/^\[Clinic note · ([^\]]+)\]\s*(.*)$/s);
    const display = m?.[2] ?? t.replace(/^\[Clinic\]\s*/, '');
    return m?.[1]
      ? { text: t, time, role: 'Unknown', authorName: m[1], display }
      : { text: t, time, role: 'Unknown', display };
  }
  if (t.startsWith('[Referrer · ')) {
    const m = t.match(/^\[Referrer · ([^\]]+)\]\s*(.*)$/s);
    const display = m?.[2] ?? t;
    return m?.[1]
      ? { text: t, time, role: 'Unknown', authorName: m[1], display }
      : { text: t, time, role: 'Unknown', display };
  }
  if (t.startsWith('[System]')) {
    return { text: t, time, role: 'System', display: t.replace(/^\[System\]\s*/, '') };
  }
  // Plain note from referrer's wizard at submit-time.
  return { text: t, time, role: 'System', display: t };
}

interface Props {
  sr: ServiceRequest;
  practitionerRoles: Map<string, PractitionerInfo>;
  /** Whose perspective is rendering this timeline — used to swap matching
   *  role labels to "You". Pass 'Referrer' from the doctor portal,
   *  'ClinicStaff' from the clinic UI. Omitting it keeps neutral labels. */
  viewerRole?: AuthorRole;
}

const STYLE: Record<AuthorRole, { Icon: (p: { className?: string }) => React.ReactNode; bg: string; color: string; label: string }> = {
  'ClinicStaff': { Icon: UserIcon,        bg: 'bg-emerald-50', color: 'text-emerald-700', label: 'Clinic' },
  'Referrer':    { Icon: StethoscopeIcon, bg: 'bg-accent/10',  color: 'text-accent',      label: 'Referrer' },
  'System':      { Icon: AlertCircleIcon, bg: 'bg-bone',       color: 'text-smoke',       label: 'System' },
  'Unknown':     { Icon: FileIcon,        bg: 'bg-amber-50',   color: 'text-amber-800',   label: 'Unverified' },
};

export function ActivityTimeline({ sr, practitionerRoles, viewerRole }: Props) {
  const entries: Entry[] = [];
  if (sr.meta?.lastUpdated) {
    entries.push({
      text: 'Referral submitted',
      time: sr.meta.lastUpdated,
      role: 'System',
      display: 'Referral submitted',
    });
  }
  for (const n of sr.note ?? []) {
    if (!n.text) continue;
    const ref = (n as { authorReference?: { reference?: string; display?: string } }).authorReference;
    entries.push(classify(n.text, n.time, ref?.reference, ref?.display, practitionerRoles));
  }
  // Internal notes never reach non-clinic viewers — surgical filter so the
  // referrer's portal can never accidentally render shift-handoff context.
  const visibleEntries = viewerRole === 'ClinicStaff'
    ? entries
    : entries.filter((e) => !e.internal);
  visibleEntries.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));

  if (visibleEntries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-hairline p-4 text-center text-[12px] text-smoke">
        No activity yet — messages and updates from the clinic will appear here.
      </div>
    );
  }

  // Show only the most recent VISIBLE_LIMIT entries; tuck the rest inside a
  // native <details> so the page doesn't bleed into a 50-row audit log.
  const VISIBLE_LIMIT = 5;
  const visible = visibleEntries.slice(0, VISIBLE_LIMIT);
  const hidden = visibleEntries.slice(VISIBLE_LIMIT);

  const renderEntry = (e: Entry, i: number) => {
    const style = STYLE[e.role];
    const Icon = style.Icon;
    const isMine = !!viewerRole && e.role === viewerRole;
    const label = isMine ? 'You' : style.label;
    return (
      <li key={i} className="flex gap-2.5">
        <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${style.bg}`}>
          <Icon className={`h-3.5 w-3.5 ${style.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[11px] font-semibold ${style.color}`}>{label}</span>
            {!isMine && e.authorName && <span className="text-[12px] text-graphite">· {e.authorName}</span>}
            <span className="text-[11px] text-ash">· {timeAgo(e.time)}</span>
            {e.internal && (
              <span
                className="rounded bg-amber-100 px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-microcaps text-amber-900"
                title="Internal note — not visible to the referring doctor"
              >
                Internal
              </span>
            )}
          </div>
          <div className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink">
            {e.display}
          </div>
          {e.role === 'Unknown' && (
            <div className="mt-1 text-[11px] text-amber-800">⚠ Author role couldn&apos;t be verified.</div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div>
      <ol className="space-y-3.5">{visible.map(renderEntry)}</ol>
      {hidden.length > 0 && (
        <details className="group mt-3 [&[open]_.show-more-label]:hidden [&[open]_.show-less-label]:inline">
          <summary className="cursor-pointer list-none border-t border-hairline pt-3 text-[12.5px] font-medium text-graphite hover:text-ink">
            <span className="show-more-label">
              Show {hidden.length} earlier {hidden.length === 1 ? 'entry' : 'entries'} ↓
            </span>
            <span className="show-less-label hidden">Hide earlier entries ↑</span>
          </summary>
          <ol className="mt-3.5 space-y-3.5">{hidden.map((e, i) => renderEntry(e, i + VISIBLE_LIMIT))}</ol>
        </details>
      )}
    </div>
  );
}

/** Helper: extract unique Practitioner ids referenced from SR.note authorReferences. */
export function authorRefIdsFromSr(sr: ServiceRequest): Set<string> {
  const ids = new Set<string>();
  for (const n of sr.note ?? []) {
    const ref = (n as { authorReference?: { reference?: string } }).authorReference?.reference;
    const id = ref?.split('/')[1];
    if (id) ids.add(id);
  }
  return ids;
}
