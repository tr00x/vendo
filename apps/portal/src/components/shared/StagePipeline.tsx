import { stageIndex, STAGE_ORDER, type Stage } from '@/lib/stage';
import { CheckIcon } from '@/components/ui/icons';

interface Props {
  stage: Stage;
  cancelled?: boolean;
}

export function StagePipeline({ stage, cancelled }: Props) {
  if (cancelled) {
    return (
      <div className="rounded-md border border-signal-stop/20 bg-signal-stop/5 px-5 py-4">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-signal-stop">
          <span className="h-2 w-2 rounded-full bg-signal-stop" aria-hidden />
          Referral cancelled
        </div>
        <p className="mt-1 text-[12.5px] text-graphite">
          The clinic has been notified. No further action will be taken on this referral.
        </p>
      </div>
    );
  }

  const currentIdx = stageIndex(stage);

  return (
    <ol
      className="flex w-full items-start gap-1 sm:gap-2"
      aria-label="Referral stages"
    >
      {STAGE_ORDER.map((s, idx) => {
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <li
            key={s.key}
            className="flex flex-1 flex-col"
            title={s.description}
            {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
          >
            <div className="flex w-full items-center gap-2">
              <div
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition ${
                  isPast
                    ? 'bg-cta text-white'
                    : isCurrent
                    ? 'bg-cta text-white ring-4 ring-ink/10'
                    : 'border border-hairline bg-paper text-ash'
                }`}
              >
                {isPast ? <CheckIcon className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              {idx < STAGE_ORDER.length - 1 && (
                <div className={`h-0.5 flex-1 transition ${isPast ? 'bg-ink' : 'bg-hairline'}`} />
              )}
            </div>
            <div className="mt-2">
              <div
                className={`text-[12.5px] font-semibold tracking-tightish ${
                  isPast || isCurrent ? 'text-ink' : 'text-smoke'
                }`}
              >
                {s.label}
              </div>
              <div className="mt-0.5 hidden text-[11.5px] leading-snug text-smoke sm:block">
                {s.description}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
