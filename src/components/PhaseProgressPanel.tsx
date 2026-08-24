import { Card } from '@/components/ui';
import { listFamilies, pluralize } from '@/lib/format';
import type { PhaseProgress } from '@/lib/consensus';

/**
 * "3 of 4 families are in. Waiting on the Chens."
 *
 * Naming who the group is waiting on is the social pressure that actually moves
 * these decisions — far more than a deadline nobody looks at.
 */
export function PhaseProgressPanel({
  progress,
  nudge,
  children,
}: {
  progress: PhaseProgress;
  nudge?: boolean;
  children?: React.ReactNode;
}) {
  const pct = progress.total === 0 ? 0 : (progress.responded / progress.total) * 100;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-text">
          {progress.responded} of {progress.total}{' '}
          {progress.total === 1 ? 'family is' : 'families are'} in
        </p>
        {progress.waitingOn.length > 0 ? (
          <p className="text-sm text-muted">
            Waiting on: {listFamilies(progress.waitingOn.map((f) => f.name))}
          </p>
        ) : (
          <p className="text-sm text-moss-600">Everyone has weighed in</p>
        )}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>

      {nudge && progress.waitingOn.length > 0 ? (
        <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">
          {pluralize(progress.waitingOn.length, 'family', 'families')} still quiet. You can move
          ahead without them, or drop them from the trip on the Who screen.
        </p>
      ) : null}

      {children ? <div className="flex flex-wrap gap-2 pt-1">{children}</div> : null}
    </Card>
  );
}
