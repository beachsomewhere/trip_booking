'use client';

import { useActionState, useState } from 'react';
import { proposeAnchor, proposeDestination } from '@/actions/proposals';
import { PlaceAutocomplete, type SelectedPlace } from '@/components/places/PlaceAutocomplete';
import type { ActionState } from '@/actions/auth';
import { Button, Field, FormError, Textarea } from '@/components/ui';

const RADII = [1, 3, 5, 10, 25];

/**
 * Shared form for the two place-picking phases. `destination` asks only where;
 * `anchor` adds the radius that the lodging search will later be run inside.
 */
export function ProposePlaceForm({
  tripId,
  mode,
  defaultRadius = 5,
}: {
  tripId: string;
  mode: 'destination' | 'anchor';
  defaultRadius?: number;
}) {
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [radius, setRadius] = useState(defaultRadius);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const submit = mode === 'anchor' ? proposeAnchor : proposeDestination;
      const result = await submit(tripId, prev, fd);
      if (result.ok) setPlace(null);
      return result;
    },
    {},
  );

  const needsCoords = mode === 'anchor';
  const missingCoords = needsCoords && place !== null && place.lat === undefined;

  return (
    <form action={action} className="space-y-4">
      <PlaceAutocomplete
        label={mode === 'anchor' ? 'Base the search around' : 'Where should we go?'}
        hint={
          mode === 'anchor'
            ? 'A specific spot — the lift base, the old town, a beach.'
            : 'A resort, an island, a city. Whatever the group would say out loud.'
        }
        placeholder={mode === 'anchor' ? 'Keystone River Run Gondola' : 'Keystone Ski Resort'}
        value={place}
        onSelect={setPlace}
        requireCoords={needsCoords}
      />

      {place ? (
        <>
          <input type="hidden" name="name" value={place.name} />
          <input type="hidden" name="placeId" value={place.placeId ?? ''} />
          <input type="hidden" name="address" value={place.address ?? ''} />
          <input type="hidden" name="lat" value={place.lat ?? ''} />
          <input type="hidden" name="lng" value={place.lng ?? ''} />
          <input type="hidden" name="photoUrl" value={place.photoUrl ?? ''} />
        </>
      ) : null}

      {mode === 'anchor' ? (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-text">How far out to look</span>
          <input type="hidden" name="radiusMi" value={radius} />
          <div className="flex flex-wrap gap-2">
            {RADII.map((r) => (
              <Button
                key={r}
                type="button"
                variant={radius === r ? 'primary' : 'secondary'}
                onClick={() => setRadius(r)}
              >
                {r} mi
              </Button>
            ))}
          </div>
          <span className="block text-xs text-muted">
            Everything the group looks at later will sit inside this circle.
          </span>
        </div>
      ) : null}

      <Field label="Why here?" hint="One line. It's what other families read before voting.">
        <Textarea name="note" maxLength={280} placeholder="Ski-in, ski-out and there's a pool." />
      </Field>

      {missingCoords ? (
        <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">
          No map pin for this one, so the automatic search for nearby places won&apos;t run. The
          group can still agree on it and paste links by hand.
        </p>
      ) : null}

      <FormError message={state.error} />
      {state.ok ? <p className="text-sm text-moss-600">{state.ok}</p> : null}

      <Button type="submit" disabled={pending || !place}>
        {pending ? 'Adding…' : place ? `Suggest ${place.name}` : 'Pick a place first'}
      </Button>
    </form>
  );
}
