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
  myFamilyId,
  awaitingInvite = [],
  children,
}: {
  progress: PhaseProgress;
  nudge?: boolean;
  /** Lets the panel address you directly instead of listing you as a laggard. */
  myFamilyId?: string | null;
  /**
   * Families invited but not yet joined. They cannot vote, so they are absent
   * from `progress` entirely — which made the panel claim "everyone has weighed
   * in" while an invitation was still outstanding.
   */
  awaitingInvite?: { id: string; name: string }[];
  children?: React.ReactNode;
}) {
  const pct = progress.total === 0 ? 0 : (progress.responded / progress.total) * 100;

  // Naming who the group is waiting on is the social pressure that moves these
  // decisions — but only when it is someone else. Telling a person the group is
  // waiting on them, by their own family name, reads like the app nagging you
  // on behalf of nobody. Address them in second person instead.
  const others = progress.waitingOn.filter((f) => f.id !== myFamilyId);
  const waitingOnMe = progress.waitingOn.some((f) => f.id === myFamilyId);

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-text">
          {progress.responded} of {progress.total}{' '}
          {progress.total === 1 ? 'family is' : 'families are'} in
        </p>
        {progress.waitingOn.length === 0 ? (
          <p className="text-sm text-moss-600">
            {awaitingInvite.length > 0 ? 'Everyone who has joined' : 'Everyone'} has weighed in
          </p>
        ) : waitingOnMe && others.length === 0 ? (
          <p className="text-sm text-accent">Your turn</p>
        ) : waitingOnMe ? (
          <p className="text-sm text-muted">
            Waiting on you and {listFamilies(others.map((f) => f.name))}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Waiting on: {listFamilies(others.map((f) => f.name))}
          </p>
        )}
      </div>

      {/* Per-family breakdown. A sentence naming the stragglers is fine with two
          families and unreadable with six — this stays legible either way, and
          answers "who exactly are we waiting on" at a glance. */}
      <ul className="space-y-1 border-t border-edge pt-3">
        {progress.waitingOn
          .map((f) => ({ ...f, done: false }))
          .concat(progress.respondedFamilies.map((f) => ({ ...f, done: true })))
          .sort((a, b) => Number(a.done) - Number(b.done) || a.name.localeCompare(b.name))
          .map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
              <span className={f.done ? 'text-muted' : 'text-text'}>
                {f.name}
                {f.id === myFamilyId ? <span className="text-muted"> (you)</span> : null}
              </span>
              <span className={f.done ? 'text-moss-600' : 'text-muted'}>
                {f.done ? 'weighed in' : 'not yet'}
              </span>
            </li>
          ))}

        {awaitingInvite.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">{f.name}</span>
            <span className="text-clay-600">invite not accepted</span>
          </li>
        ))}
      </ul>

      {awaitingInvite.length > 0 ? (
        <p className="text-xs text-muted">
          Families who haven&apos;t accepted can&apos;t vote, so they aren&apos;t counted above.
        </p>
      ) : null}

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Only offer to move on without OTHER families — "move ahead without
          yourself" is nonsense, and this used to fire when you were the only
          one who had not answered. */}
      {nudge && others.length > 0 ? (
        <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">
          {pluralize(others.length, 'family', 'families')} still quiet. You can move
          ahead without them, or drop them from the trip on the Who screen.
        </p>
      ) : null}

      {children ? <div className="flex flex-wrap gap-2 pt-1">{children}</div> : null}
    </Card>
  );
}
