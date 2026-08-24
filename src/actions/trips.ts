'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient, getUser } from '@/lib/supabase/server';
import type { ActionState } from '@/actions/auth';
import { phaseHref, type TripPhase } from '@/lib/phases';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Give the trip a name.').max(120),
  familyName: z
    .string()
    .trim()
    .min(1, 'What should the group call your family?')
    .max(60),
  targetDays: z.coerce.number().int().min(1).max(60).default(7),
});

/**
 * Creates the trip and the organizer's own family together — see create_trip()
 * in the schema. Doing it in one RPC means a trip can never exist with an
 * organizer who is not themselves a participant.
 */
export async function createTrip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getUser();
  if (!user) redirect('/login');

  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    familyName: formData.get('familyName'),
    targetDays: formData.get('targetDays') ?? 7,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: parsed.data.name,
    p_family_name: parsed.data.familyName,
    p_target_days: parsed.data.targetDays,
  });

  if (error) return { error: error.message };
  redirect(`/trips/${data}/families`);
}

/**
 * Moves the trip to another step and takes the caller there.
 *
 * The navigation is the point: advancing without it leaves you on the screen
 * you just finished, with only the stepper hinting that anything happened.
 */
export async function advancePhase(tripId: string, to: TripPhase) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('advance_phase', { p_trip_id: tripId, p_to: to });
  if (error) throw new Error(error.message);

  revalidatePath(`/trips/${tripId}`, 'layout');
  redirect(phaseHref(tripId, to));
}

export async function setTripTarget(tripId: string, target: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_trip_target', {
    p_trip_id: tripId,
    p_target: target,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/trips/${tripId}`, 'layout');
}
