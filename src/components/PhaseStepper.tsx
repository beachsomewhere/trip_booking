import Link from 'next/link';
import { PHASE_META, PHASES, phaseIndex, type TripPhase } from '@/lib/phases';
import { cx } from '@/components/ui';

/**
 * The five decisions, in order, with the current one marked.
 *
 * Completed steps stay clickable so a group can go back and look at what they
 * agreed; future steps do not, because jumping ahead is exactly the behaviour
 * that turns a trip plan back into a group chat.
 */
export function PhaseStepper({ tripId, phase }: { tripId: string; phase: TripPhase }) {
  const currentIdx = phaseIndex(phase);

  return (
    <nav aria-label="Trip progress" className="flex flex-wrap items-center gap-1">
      {PHASES.map((p, i) => {
        const meta = PHASE_META[p];
        const done = i < currentIdx;
        const current = i === currentIdx;
        const content = (
          <span
            className={cx(
              'rounded-full px-3 py-1 text-sm transition-colors',
              current && 'bg-accent text-white font-medium',
              done && 'text-accent hover:bg-accent-soft',
              !current && !done && 'text-muted',
            )}
          >
            {meta.short}
          </span>
        );

        return (
          <span key={p} className="flex items-center gap-1">
            {done ? (
              <Link href={`/trips/${tripId}/${meta.segment}`}>{content}</Link>
            ) : (
              <span aria-current={current ? 'step' : undefined}>{content}</span>
            )}
            {i < PHASES.length - 1 ? (
              <span aria-hidden className="text-edge">
                ›
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
