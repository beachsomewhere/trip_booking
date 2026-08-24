'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { listFamilies } from '@/lib/format';
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
  const emailLists = formData.getAll('personEmails').map((v) => String(v));

  const num = (v: string) => (v === '' ? null : Number(v));
  const splitEmails = (v: string) =>
    [...new Set(v.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

  const people = names
    .map((name, i) => ({
      name,
      birth_month: num(months[i] ?? ''),
      birth_year: num(years[i] ?? ''),
      person_id: personIds[i] || null,
      emails: splitEmails(emailLists[i] ?? ''),
    }))
    .filter((p) => p.name.length > 0);

  // Both are load-bearing, so they are required rather than encouraged:
  // without a birth month and year there is no age to compute, and a family
  // with no address at all cannot be reached about the trip again.
  const missingBirth = people.filter((p) => p.birth_month == null || p.birth_year == null);
  if (missingBirth.length > 0) {
    return {
      error: `Add a birth month and year for ${listFamilies(missingBirth.map((p) => p.name))}.`,
    };
  }

  if (!people.some((p) => p.emails.length > 0)) {
    return {
      error:
        'At least one person needs an email address, or nobody in your family can be reached about the trip.',
    };
  }

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
      await replaceEmails(supabase, person.person_id, person.emails);
    } else {
      const { data, error } = await supabase
        .from('household_people')
        .insert(payload)
        .select('id')
        .single();
      if (error) return { error: error.message };
      if (data?.id) {
        keptIds.push(data.id);
        await replaceEmails(supabase, data.id, person.emails);
      }
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

/** Emails are replaced wholesale so removing one here actually removes it. */
async function replaceEmails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  emails: string[],
) {
  await supabase.from('household_person_emails').delete().eq('person_id', personId);
  if (emails.length > 0) {
    await supabase
      .from('household_person_emails')
      .insert(emails.map((email) => ({ person_id: personId, email })));
  }
}

export async function loadMyHousehold() {
  const supabase = await createClient();
  const { data: householdId } = await supabase.rpc('ensure_household');
  if (!householdId) return { householdId: null, people: [] };

  const [{ data: people }, { data: household }] = await Promise.all([
    supabase
      .from('household_people')
      .select('id, name, birth_year, birth_month, household_person_emails(email)')
      .eq('household_id', householdId)
      .order('birth_year', { ascending: true, nullsFirst: false }),
    supabase.from('households').select('name').eq('id', householdId).maybeSingle(),
  ]);

  return {
    householdId,
    householdName: household?.name ?? '',
    people: (people ?? []).map((p) => ({
      personId: p.id,
      name: p.name,
      birthYear: p.birth_year == null ? '' : String(p.birth_year),
      birthMonth: p.birth_month == null ? '' : String(p.birth_month),
      emails: (p.household_person_emails ?? []).map((e) => e.email).join(', '),
    })),
  };
}

/** Renames the household, and every trip it is on that can take the name. */
export async function renameHousehold(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get('householdName') ?? '').trim();
  if (!name) return { error: 'Your family needs a name.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('rename_household', { p_name: name });
  if (error) return { error: error.message };

  revalidatePath('/household');
  revalidatePath('/trips');
  return { ok: `Saved. You'll show up as ${name} on your trips.` };
}

/**
 * Households that list your address against one of their people.
 *
 * Offered, never taken. Anyone can type any address into their own household,
 * so joining on an email match alone would let a stranger decide which family
 * you land in — and then read whatever you entered into it. The match only ever
 * produces a question.
 */
export interface ClaimableHousehold {
  householdId: string;
  householdName: string;
  personName: string;
}

export async function loadClaimableHouseholds(): Promise<ClaimableHousehold[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('claimable_households');
  if (error) {
    console.error('[claimable_households]', error.message);
    return [];
  }
  return (data ?? []).map((h) => ({
    householdId: h.household_id,
    householdName: h.household_name,
    personName: h.person_name,
  }));
}

export async function claimHousehold(householdId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('claim_household', { p_household_id: householdId });
  if (error) return { error: error.message };
  revalidatePath('/household');
  revalidatePath('/trips', 'layout');
  return {};
}

export async function declineHouseholdClaim(householdId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('decline_household_claim', { p_household_id: householdId });
  if (error) return { error: error.message };
  revalidatePath('/household');
  revalidatePath('/trips', 'layout');
  return {};
}
