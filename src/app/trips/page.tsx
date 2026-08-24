import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Badge, Button, Card, EmptyState, PageTitle } from '@/components/ui';
import { createClient, getUser } from '@/lib/supabase/server';
import { PHASE_META, phaseHref, type TripPhase } from '@/lib/phases';
import { daysUntil } from '@/lib/consensus';
import { pluralize } from '@/lib/format';

export default async function TripsPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/trips');

  const supabase = await createClient();
  // RLS scopes this to trips the signed-in user is actually part of.
  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, name, phase, target_finalize_by, organizer_user_id, families!families_trip_id_fkey(id, status)')
    .order('created_at', { ascending: false });
  if (error) console.error('[trips] query failed', error);

  return (
    <>
      <AppHeader email={user.email} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <PageTitle title="My trips" />
          <Link href="/trips/new">
            <Button>Start a trip</Button>
          </Link>
        </div>

        <div className="mt-6 space-y-3">
          {!trips || trips.length === 0 ? (
            <EmptyState
              title="No trips yet"
              body="Start one, invite a few families, and the app walks everyone through the rest."
            />
          ) : (
            trips.map((trip) => {
              const phase = trip.phase as TripPhase;
              const active = (trip.families ?? []).filter(
                (f) => f.status === 'active' || f.status === 'invited',
              ).length;
              const days = daysUntil(trip.target_finalize_by);
              const overdue = days < 0 && phase !== 'finalized';

              return (
                <Link key={trip.id} href={phaseHref(trip.id, phase)} className="block">
                  <Card className="transition-colors hover:border-accent">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-text">{trip.name}</span>
                      <Badge tone={phase === 'finalized' ? 'good' : 'accent'}>
                        {PHASE_META[phase].label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {pluralize(active, 'family', 'families')}
                      {trip.organizer_user_id === user.id ? ' · you organize' : ''}
                      {phase === 'finalized'
                        ? ' · locked in'
                        : overdue
                          ? ` · ${pluralize(Math.abs(days), 'day')} past target`
                          : ` · ${pluralize(days, 'day')} left`}
                    </p>
                  </Card>
                </Link>
              );
            })
          )}
        </div>
      </main>
    </>
  );
}
