import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { AttendeeEditor } from '@/components/families/AttendeeEditor';
import { ClaimHousehold } from '@/components/families/ClaimHousehold';
import {
  loadClaimableHouseholds,
  loadMyHousehold,
  saveHouseholdPeople,
} from '@/actions/household';
import { FriendsCard } from '@/components/friends/FriendsCard';
import { PendingFriendRequests } from '@/components/friends/PendingFriendRequests';
import {
  loadFriends,
  loadPendingFriendRequests,
  loadSentFriendRequests,
} from '@/actions/friends';
import { HouseholdNameForm } from '@/components/HouseholdNameForm';
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

  const [{ people, householdName = '' }, friends, sent, pendingRequests, claimable] =
    await Promise.all([
      loadMyHousehold(),
      loadFriends(),
      loadSentFriendRequests(),
      loadPendingFriendRequests(),
      loadClaimableHouseholds(),
    ]);

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
            subtitle="Entered once and reused. Every new trip starts from this — you just tick who's going that time, and anyone with an email can follow along."
          />

          <ClaimHousehold options={claimable} />
          <PendingFriendRequests requests={pendingRequests} />

          <Card>
            <HouseholdNameForm initial={householdName} />
          </Card>

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
                emails: p.emails ?? '',
              }))}
            />
          </Card>

          <Card>
            <FriendsCard friends={friends} sent={sent} />
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
