'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Keeps a trip screen current while other families are working on it.
 *
 * Several people act on the same trip at once, so without this every page is a
 * snapshot: you vote on a week that was withdrawn ten minutes ago, or sit
 * waiting on a family who already locked in.
 *
 * It re-runs the server render rather than patching state locally. All the
 * derived logic — who is outstanding, whether a lock went stale, whether any
 * option is unanimously preferred — lives in the server components, and
 * duplicating it client-side is how the two quietly start disagreeing.
 */

/** Tables whose changes alter what a trip screen shows. */
const WATCHED = [
  'families',
  'invitations',
  'phase_signoffs',
  'date_proposals',
  'date_votes',
  'destination_proposals',
  'destination_votes',
  'lodging_prefs',
  'lodging_candidates',
  'lodging_picks',
  'lodging_comments',
  'lodging_selections',
];

export function TripLiveRefresh({ tripId }: { tripId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`trip:${tripId}`);

    // One burst of writes — a vote plus its note, or a save that replaces every
    // attendee row — should cost one re-render, not one per row.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    for (const table of WATCHED) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `trip_id=eq.${tripId}` },
        refresh,
      );
    }

    // The trip row itself carries the phase, so this is what moves everyone on
    // when someone closes a step.
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
      refresh,
    );

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [tripId, router]);

  return null;
}
