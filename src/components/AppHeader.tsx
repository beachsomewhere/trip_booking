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
          {email ? <span className="hidden text-sm text-muted sm:inline">{email}</span> : null}
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
