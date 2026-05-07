export interface DashboardStats {
  total: number;
  pending: number;
  scheduled: number;
  completed: number;
}

const cells = [
  { key: 'total',     label: 'Total',     hint: 'Every referral you ever sent.',           dot: null,                       dotRing: null  },
  { key: 'pending',   label: 'Pending',   hint: 'Awaiting an appointment.',                dot: 'bg-amber-500',             dotRing: 'ring-amber-200'    },
  { key: 'scheduled', label: 'Scheduled', hint: 'Booked — patient has a date and time.',   dot: 'bg-accent',                dotRing: 'ring-accent/30'    },
  { key: 'completed', label: 'Completed', hint: 'Imaging finished.',                       dot: 'bg-emerald-500',           dotRing: 'ring-emerald-200'  },
] as const;

export function StatCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="mb-6 grid grid-cols-2 overflow-hidden rounded-md border border-hairline bg-paper sm:grid-cols-4">
      {cells.map((c, idx) => {
        const value = stats[c.key];
        return (
          <div
            key={c.key}
            title={c.hint}
            className={`flex flex-col gap-1 px-5 py-4 ${
              idx > 0 ? 'border-t border-hairline sm:border-l sm:border-t-0' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              {c.dot && (
                <span
                  className={`h-2 w-2 rounded-full ring-2 ring-inset ${c.dot} ${c.dotRing}`}
                  aria-hidden
                />
              )}
              <span className="text-[12.5px] font-medium text-graphite">{c.label}</span>
            </div>
            <div className="text-[28px] font-semibold leading-none tracking-tightish tabular text-ink">
              {value}
            </div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-smoke">{c.hint}</div>
          </div>
        );
      })}
    </div>
  );
}
