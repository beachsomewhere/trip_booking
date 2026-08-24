'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from '@/actions/auth';

/**
 * Edits the household's people outside any trip.
 *
 * This is the durable record — names and birth month/year — that every future
 * trip prefills from. It deliberately does not touch any trip's attendee list:
 * who is actually going on a given trip is a per-trip question, answered on
 * that trip's Who screen.
 */
export async function saveHouseholdPeople(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const names = formData.getAll('attendeeName').map((v) => String(v).trim());
  const months = formData.getAll('birthMonth').map((v) => String(v).trim());
  const years = formData.getAll('birthYear').map((v) => String(v).trim());
  const personIds = formData.getAll('personId').map((v) => String(v).trim());

  const num = (v: string) => (v === '' ? null : Number(v));

  const people = names
    .map((name, i) => ({
      name,
      birth_month: num(months[i] ?? ''),
      birth_year: num(years[i] ?? ''),
      person_id: personIds[i] || null,
    }))
    .filter((p) => p.name.length > 0);

  const supabase = await createClient();
  const { data: householdId, error: hhError } = await supabase.rpc('ensure_household');
  if (hhError) return { error: hhError.message };

  const keptIds: string[] = [];

  for (const person of people) {
    const payload = {
      household_id: householdId,
      name: person.name,
      birth_month: person.birth_month,
      birth_year: person.birth_year,
    };

    if (person.person_id) {
      const { error } = await supabase
        .from('household_people')
        .update(payload)
        .eq('id', person.person_id);
      if (error) return { error: error.message };
      keptIds.push(person.person_id);
    } else {
      const { data, error } = await supabase
        .from('household_people')
        .insert(payload)
        .select('id')
        .single();
      if (error) return { error: error.message };
      if (data?.id) keptIds.push(data.id);
    }
  }

  // Removing someone here removes them from the household. Their attendee rows
  // on past trips keep their own name and birth snapshot, so history stays
  // readable — person_id simply goes null.
  const { error: delError } = await supabase
    .from('household_people')
    .delete()
    .eq('household_id', householdId)
    .not('id', 'in', `(${keptIds.length > 0 ? keptIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);
  if (delError) return { error: delError.message };

  revalidatePath('/household');
  revalidatePath('/trips');
  return { ok: 'Saved. New trips will start with these people.' };
}

export async function loadMyHousehold() {
  const supabase = await createClient();
  const { data: householdId } = await supabase.rpc('ensure_household');
  if (!householdId) return { householdId: null, people: [] };

  const { data: people } = await supabase
    .from('household_people')
    .select('id, name, birth_year, birth_month')
    .eq('household_id', householdId)
    .order('birth_year', { ascending: true, nullsFirst: false });

  return {
    householdId,
    people: (people ?? []).map((p) => ({
      personId: p.id,
      name: p.name,
      birthYear: p.birth_year == null ? '' : String(p.birth_year),
      birthMonth: p.birth_month == null ? '' : String(p.birth_month),
    })),
  };
}
