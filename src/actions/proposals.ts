'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, getUser } from '@/lib/supabase/server';
import type { ActionState } from '@/actions/auth';
import type { VoteChoice } from '@/lib/consensus';

/**
 * Shared machinery for the three "a family proposes, the others vote" phases.
 *
 * Dates, destination, and anchor differ only in what a proposal carries — the
 * voting, withdrawal, sign-off, and resolution are identical, so they live here
 * once instead of three times.
 */
export type ProposalKind = 'dates' | 'destination' | 'anchor';

const TABLES = {
  dates: { proposals: 'date_proposals', votes: 'date_votes', resolve: 'resolve_dates' },
  destination: {
    proposals: 'destination_proposals',
    votes: 'destination_votes',
    resolve: 'resolve_destination',
  },
  anchor: { proposals: 'anchor_proposals', votes: 'anchor_votes', resolve: 'resolve_anchor' },
} as const;

/**
 * The caller's family for this trip. Every write is attributed to what the
 * database says, never to a family id the browser sent — that is the whole
 * reason my_family_id() exists as a SECURITY DEFINER function.
 */
async function requireMyFamily(tripId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_family_id', { p_trip_id: tripId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('You are not part of this trip.');
  return data;
}

function revalidateTrip(tripId: string) {
  revalidatePath(`/trips/${tripId}`, 'layout');
}

export async function castVote(
  kind: ProposalKind,
  tripId: string,
  proposalId: string,
  choice: VoteChoice,
) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in.');
  const familyId = await requireMyFamily(tripId);
  const supabase = await createClient();

  // Dynamic table name: the three vote tables are column-identical by design,
  // but the generated types cannot express "one of these three", so the client
  // is widened here rather than duplicating this function three times.
  const { error } = await (supabase.from(TABLES[kind].votes) as ReturnType<typeof supabase.from>)
    .upsert(
      {
        proposal_id: proposalId,
        trip_id: tripId,
        family_id: familyId,
        user_id: user.id,
        choice,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'proposal_id,family_id' },
    );

  if (error) throw new Error(error.message);
  revalidateTrip(tripId);
}

export async function withdrawProposal(kind: ProposalKind, tripId: string, proposalId: string) {
  const supabase = await createClient();
  const { error } = await (
    supabase.from(TABLES[kind].proposals) as ReturnType<typeof supabase.from>
  )
    .update({ withdrawn_at: new Date().toISOString() })
    .eq('id', proposalId);

  if (error) throw new Error(error.message);
  revalidateTrip(tripId);
}

/** Organizer picks the winner; the RPC writes it onto the trip and advances. */
export async function resolveProposal(kind: ProposalKind, tripId: string, proposalId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(TABLES[kind].resolve, {
    p_trip_id: tripId,
    p_proposal_id: proposalId,
  });
  if (error) throw new Error(error.message);
  revalidateTrip(tripId);
}

// ---------------------------------------------------------------------------
// Proposal creators. These differ per phase, so they are not generic.
// ---------------------------------------------------------------------------

const dateSchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date.'),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick an end date.'),
    note: z.string().trim().max(280).optional(),
  })
  .refine((v) => v.end >= v.start, { message: 'The end date comes before the start date.' });

export async function proposeDates(
  tripId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = dateSchema.safeParse({
    start: String(formData.get('start') ?? ''),
    end: String(formData.get('end') ?? ''),
    note: String(formData.get('note') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await getUser();
  if (!user) return { error: 'Not signed in.' };

  const familyId = await requireMyFamily(tripId);
  const supabase = await createClient();

  const { error } = await supabase.from('date_proposals').insert({
    trip_id: tripId,
    family_id: familyId,
    created_by_user_id: user.id,
    start_date: parsed.data.start,
    end_date: parsed.data.end,
    note: parsed.data.note || null,
  });
  if (error) return { error: error.message };

  revalidateTrip(tripId);
  return { ok: 'Added. The other families will see it as your suggestion.' };
}

const placeSchema = z.object({
  name: z.string().trim().min(1, 'Search for a place and pick one from the list.'),
  placeId: z.string().trim().optional(),
  address: z.string().trim().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  photoUrl: z.string().trim().optional(),
  note: z.string().trim().max(280).optional(),
});

export async function proposeDestination(
  tripId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = placeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await getUser();
  if (!user) return { error: 'Not signed in.' };
  const familyId = await requireMyFamily(tripId);
  const supabase = await createClient();

  const { error } = await supabase.from('destination_proposals').insert({
    trip_id: tripId,
    family_id: familyId,
    created_by_user_id: user.id,
    google_place_id: parsed.data.placeId || null,
    name: parsed.data.name,
    formatted_address: parsed.data.address || null,
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
    photo_url: parsed.data.photoUrl || null,
    note: parsed.data.note || null,
  });
  if (error) return { error: error.message };

  revalidateTrip(tripId);
  return { ok: 'Added to the list.' };
}

// Coordinates stay optional so the area step works without Google Places; the
// lodging search degrades to pasted links rather than the phase being blocked.
const anchorSchema = placeSchema.extend({
  radiusMi: z.coerce.number().min(0.5).max(31),
});

export async function proposeAnchor(
  tripId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = anchorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message || 'Pick a spot on the map first.' };
  }

  const user = await getUser();
  if (!user) return { error: 'Not signed in.' };
  const familyId = await requireMyFamily(tripId);
  const supabase = await createClient();

  const { error } = await supabase.from('anchor_proposals').insert({
    trip_id: tripId,
    family_id: familyId,
    created_by_user_id: user.id,
    google_place_id: parsed.data.placeId || null,
    name: parsed.data.name,
    formatted_address: parsed.data.address || null,
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
    radius_mi: parsed.data.radiusMi,
    note: parsed.data.note || null,
  });
  if (error) return { error: error.message };

  revalidateTrip(tripId);
  return { ok: 'Added to the list.' };
}

/** "We're done here" — drives the progress bar without forcing a vote. */
export async function signOffPhase(tripId: string, phase: string) {
  const familyId = await requireMyFamily(tripId);
  const supabase = await createClient();
  const { error } = await supabase.from('phase_signoffs').upsert(
    {
      trip_id: tripId,
      phase: phase as never,
      family_id: familyId,
      signed_off_at: new Date().toISOString(),
    },
    { onConflict: 'trip_id,phase,family_id' },
  );
  if (error) throw new Error(error.message);
  revalidateTrip(tripId);
}
