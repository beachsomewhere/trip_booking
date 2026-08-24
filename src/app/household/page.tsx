import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { AttendeeEditor } from '@/components/families/AttendeeEditor';
import { loadMyHousehold, saveHouseholdPeople } from '@/actions/household';
import { Card, PageTitle } from '@/components/ui';
import { getUser } from '@/lib/supabase/server';

/**
 * Your family, independent of any trip.
 *
 * Entered once and reused: starting or joining a trip prefills from here, and
 * you only tick who is actually going that time.
 */
export default async function HouseholdPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/household');

  const { people } = await loadMyHousehold();

  return (
    <>
      <AppHeader email={user.email} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href="/trips" className="text-sm text-muted">
          ← My trips
        </Link>

        <div className="mt-4 space-y-6">
          <PageTitle
            title="Your family"
            subtitle="Everyone who might come on a trip. Every new trip starts from this list — you just tick who's going that time."
          />

          <Card>
            <AttendeeEditor
              save={saveHouseholdPeople}
              tripStart={null}
              showComing={false}
              saveLabel="Save your family"
              initial={people.map((p, i) => ({
                key: `hh${i}`,
                personId: p.personId,
                name: p.name,
                birthYear: p.birthYear,
                birthMonth: p.birthMonth,
                coming: true,
              }))}
            />
          </Card>

          <p className="text-sm text-muted">
            Removing someone here takes them off future trips. Trips they already went on keep their
            own record, so past plans still read correctly.
          </p>
        </div>
      </main>
    </>
  );
}
