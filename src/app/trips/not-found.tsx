import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { Button, Card, PageTitle } from '@/components/ui';
import { getUser } from '@/lib/supabase/server';

/**
 * A trip that isn't there, or isn't yours.
 *
 * These links arrive by email, and email is opened in whatever browser happens
 * to be signed in — often as a different address than the one invited. The
 * database cannot tell the two cases apart on purpose: RLS returns no rows
 * rather than an error, so "no such trip" and "not your trip" are identical by
 * design, and saying which would leak whether a trip exists.
 *
 * What it can do is name the account being used, which is the thing the person
 * can actually act on.
 *
 * It lives at the /trips segment rather than under [id] deliberately: the trip
 * layout is what calls notFound(), and a boundary inside the segment that threw
 * does not catch it — Next looks to the parent. Placed one level down, this
 * file rendered for nothing and the bare framework 404 still showed.
 */
export default async function TripNotFound() {
  const user = await getUser();

  return (
    <>
      <AppHeader email={user?.email} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
        <Card className="space-y-5">
          <PageTitle
            title="That trip isn't here"
            subtitle="Either it no longer exists, or it isn't shared with the address you're signed in as."
          />

          {user?.email ? (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text">
              You&apos;re signed in as <strong>{user.email}</strong>. If the link came by email,
              open it signed in as the address it was sent to.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Link href="/trips">
              <Button>My trips</Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary">Sign in as someone else</Button>
            </Link>
          </div>
        </Card>
      </main>
    </>
  );
}
