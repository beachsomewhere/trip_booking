import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { PhaseStepper } from '@/components/PhaseStepper';
import { TripLiveRefresh } from '@/components/TripLiveRefresh';
import { Badge } from '@/components/ui';
import { loadTripContext } from '@/lib/queries';
import { daysUntil } from '@/lib/consensus';
import { formatDateRange, pluralize } from '@/lib/format';

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { trip, phase, userEmail, headcount, votingFamilies, families } =
    await loadTripContext(id);
  const days = daysUntil(trip.target_finalize_by);
  const finalized = phase === 'finalized';

  // Everyone on the trip, including families who have not answered their
  // invitation yet. This used to count only active families, so a trip showing
  // three families in the roster announced "2 families" at the top — which
  // reads as a bug rather than as a distinction. The trips list has always
  // counted both; now they agree.
  //
  // Counts that gate a decision still exclude them, and should: someone who
  // has not accepted cannot vote or lock a step in.
  const awaitingInvite = families.filter((f) => f.status === 'invited').length;
  const onTheTrip = votingFamilies.length + awaitingInvite;

  return (
    <>
      <AppHeader email={userEmail} />
      <TripLiveRefresh tripId={id} />
      <div className="border-b border-edge bg-surface">
        <div className="mx-auto w-full max-w-4xl space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link href="/trips" className="text-xs text-muted">
                ← All trips
              </Link>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                {trip.name}
              </h1>
              <p className="text-sm text-muted">
                {pluralize(onTheTrip, 'family', 'families')}
                {awaitingInvite > 0 ? ` (${awaitingInvite} not accepted)` : ''} ·{' '}
                {pluralize(headcount, 'person', 'people')}
                {awaitingInvite > 0 ? ' so far' : ''}
              </p>
              {trip.description ? (
                <p className="mt-1 max-w-xl text-sm text-text">{trip.description}</p>
              ) : null}

              {/* Settled decisions belong at the top, not buried on the step
                  that produced them — this is the answer to "so what did we
                  actually agree?", which is asked far more often than it is
                  decided. */}
              {trip.agreed_start_date && trip.agreed_end_date ? (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium text-accent">
                    {formatDateRange(trip.agreed_start_date, trip.agreed_end_date)}
                  </span>
                  {trip.destination_name ? (
                    <>
                      <span className="text-muted">·</span>
                      <span className="font-medium text-accent">{trip.destination_name}</span>
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
            {finalized ? (
              <Badge tone="good">Locked in</Badge>
            ) : (
              <Badge tone={days < 0 ? 'warn' : days <= 2 ? 'warn' : 'neutral'}>
                {days < 0
                  ? `${pluralize(Math.abs(days), 'day')} past target`
                  : days === 0
                    ? 'Target is today'
                    : `${pluralize(days, 'day')} to decide`}
              </Badge>
            )}
          </div>
          <PhaseStepper tripId={id} phase={phase} />
        </div>
      </div>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
