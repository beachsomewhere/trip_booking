import Link from 'next/link';
import { getUser } from '@/lib/supabase/server';
import { Button } from '@/components/ui';

const STEPS = [
  { n: '1', t: 'Who', d: 'Invite families by email. Spouses share one entry, one vote, one headcount.' },
  { n: '2', t: 'When', d: 'Everyone posts the weeks that work. Overlaps light up.' },
  { n: '3', t: 'Where', d: 'Propose a destination. Others just vote yes or no.' },
  { n: '4', t: 'What area', d: 'Drop a pin and a radius — the lift base, the old town.' },
  { n: '5', t: 'Where to stay', d: 'Shortlist places, rank your top five, see where the group lands.' },
];

export default async function Home() {
  const user = await getUser();

  return (
    <main className="flex-1">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6">
        <span className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Lock the Trip
        </span>
        <Link href={user ? '/trips' : '/login'} className="text-sm font-medium text-accent">
          {user ? 'My trips' : 'Sign in'}
        </Link>
      </header>

      <section className="mx-auto w-full max-w-3xl px-4 pb-10 pt-10 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-text sm:text-5xl">
          Stop saying you should go somewhere.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          Group trips die in the group chat. This walks everyone through the five decisions that
          actually matter — in order, one at a time — and gets you to a booking in under a week.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href={user ? '/trips/new' : '/login?next=/trips/new'}>
            <Button>Start a trip</Button>
          </Link>
          {user ? (
            <Link href="/trips">
              <Button variant="secondary">My trips</Button>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 pb-20">
        <ol className="space-y-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flex gap-4 rounded-xl border border-edge bg-surface p-4"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                {s.n}
              </span>
              <div>
                <p className="font-medium text-text">{s.t}</p>
                <p className="text-sm text-muted">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-center text-sm text-muted">
          One family dragging its feet? The organizer can move on without them.
        </p>
      </section>
    </main>
  );
}
