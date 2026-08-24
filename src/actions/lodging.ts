'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from '@/actions/auth';
import type { Database } from '@/types/db';

type HousingType = Database['public']['Enums']['housing_type'];
type StayTogetherPref = Database['public']['Enums']['stay_together_pref'];

async function myFamily(tripId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_family_id', { p_trip_id: tripId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('You are not part of this trip.');
  return data;
}

function revalidateTrip(tripId: string) {
  revalidatePath(`/trips/${tripId}`, 'layout');
}

/** What kind of place this family wants, and whether staying together matters. */
export async function saveLodgingPrefs(
  tripId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const types = formData.getAll('housingTypes').map(String) as HousingType[];
  const together = String(formData.get('stayTogether') ?? 'no_preference') as StayTogetherPref;

  if (types.length === 0) {
    return { error: 'Pick at least one kind of place.' };
  }

  const familyId = await myFamily(tripId);
  const supabase = await createClient();

  const { error } = await supabase.from('lodging_prefs').upsert(
    {
      trip_id: tripId,
      family_id: familyId,
      housing_types: types,
      stay_together_pref: together,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'trip_id,family_id' },
  );
  if (error) return { error: error.message };

  revalidateTrip(tripId);
  return { ok: 'Saved.' };
}

/** Organizer collapses everyone's preferences into the group's answer. */
export async function resolveLodgingPrefs(tripId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('resolve_lodging_prefs', { p_trip_id: tripId });
  if (error) throw new Error(error.message);
  revalidateTrip(tripId);
}

export interface CandidateInput {
  source: 'google' | 'manual';
  name: string;
  googlePlaceId?: string | null;
  url?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  photoUrl?: string | null;
  rating?: number | null;
  priceNote?: string | null;
  capacityNote?: string | null;
  housingType?: HousingType | null;
}

export async function addCandidate(tripId: string, input: CandidateInput) {
  const familyId = await myFamily(tripId);
  const supabase = await createClient();

  const { error } = await supabase.from('lodging_candidates').insert({
    trip_id: tripId,
    source: input.source,
    google_place_id: input.googlePlaceId ?? null,
    url: input.url ?? null,
    name: input.name,
    address: input.address ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photo_url: input.photoUrl ?? null,
    rating: input.rating ?? null,
    price_note: input.priceNote ?? null,
    capacity_note: input.capacityNote ?? null,
    housing_type: input.housingType ?? null,
    added_by_family_id: familyId,
  });

  // A duplicate just means someone else already added it — not worth an error.
  if (error && error.code !== '23505') throw new Error(error.message);
  revalidateTrip(tripId);
}

const manualSchema = z.object({
  url: z.string().trim().url('Paste the full link, starting with https://'),
  name: z.string().trim().min(1, 'Give it a name so the group knows what it is.').max(160),
  capacityNote: z.string().trim().max(120).optional(),
  priceNote: z.string().trim().max(120).optional(),
  photoUrl: z.string().trim().optional(),
  address: z.string().trim().max(240).optional(),
});

export async function addManualCandidate(
  tripId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await addCandidate(tripId, {
      source: 'manual',
      url: parsed.data.url,
      name: parsed.data.name,
      address: parsed.data.address || null,
      photoUrl: parsed.data.photoUrl || null,
      capacityNote: parsed.data.capacityNote || null,
      priceNote: parsed.data.priceNote || null,
      housingType: 'short_term_rental',
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not add that.' };
  }

  return { ok: 'Added to the list for everyone to look at.' };
}

export async function removeCandidate(tripId: string, candidateId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('lodging_candidates').delete().eq('id', candidateId);
  if (error) throw new Error(error.message);
  revalidateTrip(tripId);
}

/**
 * Toggles a candidate in this family's top five.
 *
 * Ranks are assigned by insertion order rather than asked for explicitly: making
 * people rank things precisely is exactly the friction that stalls this step,
 * and the tally only needs "did it make your five".
 */
export async function togglePick(tripId: string, candidateId: string) {
  const familyId = await myFamily(tripId);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('lodging_picks')
    .select('candidate_id, rank')
    .eq('trip_id', tripId)
    .eq('family_id', familyId)
    .order('rank');

  const picks = existing ?? [];
  const already = picks.find((p) => p.candidate_id === candidateId);

  if (already) {
    const { error } = await supabase
      .from('lodging_picks')
      .delete()
      .eq('family_id', familyId)
      .eq('candidate_id', candidateId);
    if (error) throw new Error(error.message);

    // Close the gap so ranks stay 1..n and the next pick has somewhere to go.
    const remaining = picks.filter((p) => p.candidate_id !== candidateId);
    for (const [i, p] of remaining.entries()) {
      await supabase
        .from('lodging_picks')
        .update({ rank: i + 1 })
        .eq('family_id', familyId)
        .eq('candidate_id', p.candidate_id);
    }
  } else {
    if (picks.length >= 5) {
      throw new Error('You already have five. Drop one first.');
    }
    const { error } = await supabase.from('lodging_picks').insert({
      trip_id: tripId,
      family_id: familyId,
      candidate_id: candidateId,
      rank: picks.length + 1,
    });
    if (error) throw new Error(error.message);
  }

  revalidateTrip(tripId);
}

/** Copies another family's shortlist wholesale — the "we trust you" button. */
export async function copyPicksFrom(tripId: string, fromFamilyId: string) {
  const familyId = await myFamily(tripId);
  const supabase = await createClient();

  const { data: theirs } = await supabase
    .from('lodging_picks')
    .select('candidate_id, rank')
    .eq('trip_id', tripId)
    .eq('family_id', fromFamilyId)
    .order('rank');

  if (!theirs || theirs.length === 0) return;

  await supabase.from('lodging_picks').delete().eq('family_id', familyId);
  const { error } = await supabase.from('lodging_picks').insert(
    theirs.map((p) => ({
      trip_id: tripId,
      family_id: familyId,
      candidate_id: p.candidate_id,
      rank: p.rank,
    })),
  );
  if (error) throw new Error(error.message);
  revalidateTrip(tripId);
}

export async function setSelection(
  tripId: string,
  candidateId: string,
  familyIds: string[],
  label?: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_lodging_selection', {
    p_trip_id: tripId,
    p_candidate_id: candidateId,
    p_family_ids: familyIds,
    p_label: label,
  });
  if (error) throw new Error(error.message);
  revalidateTrip(tripId);
}

export async function clearSelection(tripId: string, selectionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('clear_lodging_selection', {
    p_trip_id: tripId,
    p_selection_id: selectionId,
  });
  if (error) throw new Error(error.message);
  revalidateTrip(tripId);
}
