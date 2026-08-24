import { redirect } from 'next/navigation';
import { loadTripContext } from '@/lib/queries';
import { phaseHref } from '@/lib/phases';

/** The trip root always lands you on whatever decision is open right now. */
export default async function TripIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { phase } = await loadTripContext(id);
  redirect(phaseHref(id, phase));
}
