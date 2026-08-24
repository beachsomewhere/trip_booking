'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { addCandidate, addManualCandidate } from '@/actions/lodging';
import type { ActionState } from '@/actions/auth';
import { Button, Card, EmptyState, Field, FormError, Input } from '@/components/ui';

interface FoundPlace {
  placeId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  photoUrl: string | null;
  rating: number | null;
  priceLevel: string | null;
  websiteUri: string | null;
  mapsUri: string | null;
}

const PRICE_LABEL: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

/**
 * Google Places results inside the trip's circle.
 *
 * Places has no capacity or nightly rate, so these cards deliberately do not
 * pretend to: they show what Google actually knows, and the group's own
 * headcount is displayed alongside so people can judge fit themselves.
 */
export function LodgingSearchPanel({
  tripId,
  headcount,
  existingPlaceIds,
}: {
  tripId: string;
  headcount: number;
  existingPlaceIds: string[];
}) {
  const [places, setPlaces] = useState<FoundPlace[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [noCoordinates, setNoCoordinates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<string[]>(existingPlaceIds);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/places/lodging?tripId=${tripId}`);
        const json = await res.json();
        if (cancelled) return;
        setConfigured(json.configured ?? false);
        setPlaces(json.places ?? []);
        setNoCoordinates(Boolean(json.noCoordinates));
        setError(json.error ?? null);
      } catch {
        if (!cancelled) setError('Could not reach the place search.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (loading) return <p className="text-sm text-muted">Looking for places nearby…</p>;

  if (configured === false) {
    return (
      <EmptyState
        title="Place search isn't switched on"
        body="Add a GOOGLE_MAPS_API_KEY and this fills with hotels and rentals inside your circle. Until then, paste links below — everything else works the same."
      />
    );
  }

  if (noCoordinates) {
    return (
      <EmptyState
        title="No map pin for your search area"
        body="The area you agreed on was entered as text, so there is nothing to search around. Paste links below instead — voting works exactly the same."
      />
    );
  }

  if (error) return <p className="text-sm text-clay-600">{error}</p>;
  if (places.length === 0) {
    return (
      <EmptyState
        title="Nothing came back inside that circle"
        body="Try a wider radius on the previous step, or paste links to places you already know."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {places.map((p) => {
        const isAdded = added.includes(p.placeId);
        return (
          <Card key={p.placeId} className="flex flex-col gap-2 p-4">
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.photoUrl}
                alt=""
                className="h-32 w-full rounded-lg object-cover"
                loading="lazy"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text">{p.name}</p>
              {p.address ? <p className="truncate text-sm text-muted">{p.address}</p> : null}
              <p className="mt-1 text-sm text-muted">
                {p.rating ? `${p.rating}★` : 'No rating'}
                {p.priceLevel ? ` · ${PRICE_LABEL[p.priceLevel] ?? ''}` : ''}
              </p>
              <p className="text-xs text-muted">
                Google doesn&apos;t list capacity — your group is {headcount}.
              </p>
            </div>
            <Button
              variant={isAdded ? 'secondary' : 'primary'}
              disabled={isAdded || pending}
              onClick={() =>
                start(async () => {
                  await addCandidate(tripId, {
                    source: 'google',
                    googlePlaceId: p.placeId,
                    name: p.name,
                    address: p.address,
                    lat: p.lat,
                    lng: p.lng,
                    photoUrl: p.photoUrl,
                    rating: p.rating,
                    priceNote: p.priceLevel ? (PRICE_LABEL[p.priceLevel] ?? null) : null,
                    url: p.websiteUri ?? p.mapsUri ?? null,
                  });
                  setAdded((a) => [...a, p.placeId]);
                })
              }
            >
              {isAdded ? 'On the list' : 'Add to the list'}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * The Airbnb/VRBO path. Unfurling fills in what it can; when the site blocks
 * the fetch — which happens routinely — the fields stay editable rather than
 * the whole thing failing.
 */
export function PasteLinkForm({ tripId }: { tripId: string }) {
  const [url, setUrl] = useState('');
  const [looking, setLooking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [prefill, setPrefill] = useState<{ name: string; photoUrl: string; address: string } | null>(
    null,
  );

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const r = await addManualCandidate(tripId, prev, fd);
      if (r.ok) {
        setUrl('');
        setPrefill(null);
        setBlocked(false);
      }
      return r;
    },
    {},
  );

  async function unfurl() {
    if (!url.trim()) return;
    setLooking(true);
    setBlocked(false);
    try {
      const res = await fetch('/api/unfurl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      setBlocked(Boolean(json.blocked));
      setPrefill({
        name: json.title ?? '',
        photoUrl: json.image ?? '',
        address: json.siteName ?? '',
      });
    } catch {
      setBlocked(true);
      setPrefill({ name: '', photoUrl: '', address: '' });
    } finally {
      setLooking(false);
    }
  }

  return (
    <form action={action} className="space-y-4">
      <Field
        label="Paste a link"
        hint="Airbnb, VRBO, Booking, a hotel's own site — anything with a URL."
      >
        <div className="flex gap-2">
          <Input
            name="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={unfurl}
            placeholder="https://www.airbnb.com/rooms/…"
            className="flex-1"
          />
          <Button type="button" variant="secondary" onClick={unfurl} disabled={looking || !url}>
            {looking ? 'Reading…' : 'Read it'}
          </Button>
        </div>
      </Field>

      {prefill ? (
        <>
          {blocked ? (
            <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">
              That site blocked us from reading the page — Airbnb and VRBO usually do. Fill in the
              name yourself and it works exactly the same for everyone else.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" defaultValue={prefill.name} required maxLength={160} />
            </Field>
            <Field label="Sleeps how many?" hint="No site tells us this reliably.">
              <Input name="capacityNote" placeholder="Sleeps 10, 4 bedrooms" maxLength={120} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rough price" hint="Optional — helps others compare.">
              <Input name="priceNote" placeholder="$540/night" maxLength={120} />
            </Field>
            <Field label="Where">
              <Input name="address" defaultValue={prefill.address} maxLength={240} />
            </Field>
          </div>
          <input type="hidden" name="photoUrl" value={prefill.photoUrl} />
        </>
      ) : null}

      <FormError message={state.error} />
      {state.ok ? <p className="text-sm text-moss-600">{state.ok}</p> : null}

      <Button type="submit" disabled={pending || !prefill}>
        {pending ? 'Adding…' : 'Add to the list'}
      </Button>
    </form>
  );
}
