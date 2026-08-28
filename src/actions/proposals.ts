'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient, getUser } from '@/lib/supabase/server';
import type { ActionState } from '@/actions/auth';
import type { VoteChoice } from '@/lib/consensus';
import { phaseHref, type TripPhase } from '@/lib/phases';
import { announcePhaseOpen } from '@/actions/phases';

/**
 * Shared machinery for the three "a family proposes, the others vote" phases.
 *
 * Dates and destination differ only in what a proposal carries — the voting,
 * withdrawal, sign-off, and resolution are identical, so they live here once
 * instead of twice.
 */
export type ProposalKind = 'dates' | 'destination';

const TABLES = {
  dates: { proposals: 'date_proposals', votes: 'date_votes', resolve: 'resolve_dates' },
  destination: {
    proposals: 'destination_proposals',
    votes: 'destination_votes',
    resolve: 'resolve_destination',
  },
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

/**
 * Records that a family prefers what they just put forward.
 *
 * Proposing something and then showing as not having voted on it is nonsense
 * on its face, and it stalls the step: moving on needs every family to have
 * marked something preferred, so the family who cared enough to suggest was
 * the one holding it up.
 *
 * This is only safe because suggesting is gated on having already rejected
 * everything else. Without that gate it would manufacture the deadlock it is
 * meant to avoid — four options, each preferred by exactly the one family who
 * proposed it, and unanimity out of reach. With it, a new option only appears
 * when its author has genuinely ruled the others out.
 *
 * A family may prefer several options at once; that is what makes agreement
 * possible as the list grows.
 */
async function replacePreviousProposals(
  kind: ProposalKind,
  tripId: string,
  familyId: string,
  keepId: string,
) {
  const supabase = await createClient();

  // One live suggestion per family. Somebody offering an alternative because
  // theirs was rejected is swapping, not adding — leaving both up would grow
  // the list with an option they have already stopped arguing for, and every
  // extra option makes agreement harder to reach.
  const { error } = await (
    supabase.from(TABLES[kind].proposals) as ReturnType<typeof supabase.from>
  )
    .update({ withdrawn_at: new Date().toISOString() })
    .eq('trip_id', tripId)
    .eq('family_id', familyId)
    .neq('id', keepId)
    .is('withdrawn_at', null);

  if (error) console.error('[propose] could not withdraw the previous suggestion', error.message);
}

async function preferOwnProposal(kind: ProposalKind, tripId: string, proposalId: string) {
  const user = await getUser();
  if (!user) return;
  const familyId = await requireMyFamily(tripId);
  const supabase = await createClient();

  const { error } = await (supabase.from(TABLES[kind].votes) as ReturnType<typeof supabase.from>)
    .upsert(
      {
        proposal_id: proposalId,
        trip_id: tripId,
        family_id: familyId,
        user_id: user.id,
        choice: 'yes',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'proposal_id,family_id' },
    );

  // Never fatal: the suggestion itself is saved, and the family can mark it by
  // hand. Losing the proposal because a vote failed would be far worse.
  if (error) console.error('[propose] could not mark own proposal preferred', error.message);
}

export async function castVote(
  kind: ProposalKind,
  tripId: string,
  proposalId: string,
  choice: VoteChoice,
  /**
   * Sent with the vote, not after it, when the vote is a negative one. "Doesn't
   * work" with no reason tells the group there is a problem and nothing about
   * how to avoid it in the next suggestion — which is the entire point of
   * saying it.
   */
  note?: string,
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
        note: note === undefined ? undefined : note.trim().slice(0, 280) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'proposal_id,family_id' },
    );

  if (error) throw new Error(error.message);
  revalidateTrip(tripId);
}

/**
 * Explains a vote, after the fact.
 *
 * Separate from casting the vote on purpose: making people justify a click
 * before it registers is friction on the one action this app most needs to be
 * effortless. Vote first, explain if it helps.
 */
export async function saveVoteNote(
  kind: ProposalKind,
  tripId: string,
  proposalId: string,
  note: string,
) {
  const familyId = await requireMyFamily(tripId);
  const supabase = await createClient();

  const trimmed = note.trim().slice(0, 280);

  const { error } = await (supabase.from(TABLES[kind].votes) as ReturnType<typeof supabase.from>)
    .update({ note: trimmed || null })
    .eq('proposal_id', proposalId)
    .eq('family_id', familyId);

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

/** Which phase each resolve RPC leaves the trip in — mirrors the SQL. */
const RESOLVES_INTO: Record<ProposalKind, TripPhase> = {
  dates: 'destination',
  destination: 'lodging',
};

/**
 * Organizer picks the winner; the RPC writes it onto the trip and advances.
 *
 * Then move them to the step that just opened. Without this the trip advances
 * underneath you while you keep staring at the finished screen — the stepper
 * updates but the page does not, which reads like nothing happened.
 */
export async function resolveProposal(kind: ProposalKind, tripId: string, proposalId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(TABLES[kind].resolve, {
    p_trip_id: tripId,
    p_proposal_id: proposalId,
  });
  if (error) throw new Error(error.message);

  // Picking a winner is also how a step closes, so it announces the next one
  // the same way the organizer's "continue" button does.
  await announcePhaseOpen(tripId, RESOLVES_INTO[kind]);

  revalidateTrip(tripId);
  redirect(phaseHref(tripId, RESOLVES_INTO[kind]));
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

  const { data: created, error } = await supabase
    .from('date_proposals')
    .insert({
      trip_id: tripId,
      family_id: familyId,
      created_by_user_id: user.id,
      start_date: parsed.data.start,
      end_date: parsed.data.end,
      note: parsed.data.note || null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await replacePreviousProposals('dates', tripId, familyId, created.id);
  await preferOwnProposal('dates', tripId, created.id);

  revalidateTrip(tripId);
  return { ok: 'Added, and marked as the week you prefer.' };
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

  const { data: created, error } = await supabase
    .from('destination_proposals')
    .insert({
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
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await replacePreviousProposals('destination', tripId, familyId, created.id);
  await preferOwnProposal('destination', tripId, created.id);

  revalidateTrip(tripId);
  return { ok: 'Added, and marked as the place you prefer.' };
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
