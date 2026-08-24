'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/db';

/** Browser-side Supabase client. Subject to RLS, safe to expose. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
