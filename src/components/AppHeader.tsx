import Link from 'next/link';
import { signOut } from '@/actions/auth';
import { Button } from '@/components/ui';

export function AppHeader({ email }: { email?: string | null }) {
  return (
    <header className="border-b border-edge bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/trips"
          className="font-[family-name:var(--font-display)] text-base font-semibold"
        >
          Lock the Trip
        </Link>
        <div className="flex items-center gap-3">
          {/* The email doubles as the way into your household — it is the only
              thing on screen that represents "you". */}
          {email ? (
            <Link
              href="/household"
              className="hidden text-sm text-muted underline decoration-dotted underline-offset-4 hover:text-text sm:inline"
              title="Edit your family"
            >
              {email}
            </Link>
          ) : null}
          <form action={signOut}>
            <Button variant="ghost" type="submit" className="px-2 py-1 text-sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
