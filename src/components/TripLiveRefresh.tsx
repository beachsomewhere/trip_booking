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
  // Who is coming from each family. Missing here meant one spouse un-ticking a
  // child stayed invisible to everyone else until they reloaded.
  'family_attendees',
  'family_members',
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
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    // One burst of writes — a vote plus its note, or a save that replaces every
    // attendee row — should cost one re-render, not one per row.
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    void (async () => {
      // Realtime applies RLS using whatever token the socket is holding, and
      // the session is read from cookies asynchronously. Subscribing before it
      // arrives joins as `anon`, which can read nothing on this schema — so the
      // channel reports SUBSCRIBED and then never delivers a single event. That
      // failure is completely silent, which is what made it expensive to find.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase.channel(`trip:${tripId}`);

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
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tripId, router]);

  return null;
}
