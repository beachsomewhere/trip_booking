import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreateTripForm } from '@/components/CreateTripForm';
import { Card, PageTitle } from '@/components/ui';
import { getUser } from '@/lib/supabase/server';
import { loadMyHousehold } from '@/actions/household';

export default async function NewTripPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/trips/new');

  // Returning organizers should not be asked who they are again.
  const { householdName } = await loadMyHousehold();

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-12">
      <Link href="/trips" className="text-sm text-muted">
        ← My trips
      </Link>
      <Card className="mt-4 space-y-5">
        <PageTitle
          title="Start a trip"
          subtitle="You'll invite the other families on the next screen."
        />
        <CreateTripForm familyName={householdName ?? ''} />
      </Card>
    </main>
  );
}
