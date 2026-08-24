import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { PhaseStepper } from '@/components/PhaseStepper';
import { Badge } from '@/components/ui';
import { loadTripContext } from '@/lib/queries';
import { daysUntil } from '@/lib/consensus';
import { pluralize } from '@/lib/format';

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { trip, phase, userEmail, headcount, votingFamilies } = await loadTripContext(id);
  const days = daysUntil(trip.target_finalize_by);
  const finalized = phase === 'finalized';

  return (
    <>
      <AppHeader email={userEmail} />
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
                {pluralize(votingFamilies.length, 'family', 'families')} ·{' '}
                {pluralize(headcount, 'person', 'people')}
              </p>
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
