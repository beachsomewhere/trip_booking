import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import { PHASE_META, phaseHref, type TripPhase } from '@/lib/phases';

/**
 * The way forward from a step that is already settled.
 *
 * Whoever presses the button that closes a step gets redirected. Everybody else
 * finds out by opening a page that says "Locked in." and nothing more — the
 * stepper moves, but the page they are standing on offers no way onward, so the
 * trip looks stalled to everyone who did not close it.
 */
export function MovedOnBanner({
  tripId,
  currentPhase,
}: {
  tripId: string;
  currentPhase: TripPhase;
}) {
  const meta = PHASE_META[currentPhase];

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-accent bg-accent-soft">
      <div>
        <p className="font-medium text-text">This step is settled.</p>
        <p className="text-sm text-muted">
          The trip has moved on to <strong>{meta.label}</strong> — {meta.blurb.toLowerCase()}
        </p>
      </div>
      <Link href={phaseHref(tripId, currentPhase)}>
        <Button>Go to {meta.short} →</Button>
      </Link>
    </Card>
  );
}
