import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl } from '@/lib/env';

/**
 * Request-scoped Supabase client that carries the signed-in user's session.
 * Everything it does is subject to RLS — this is what pages and server actions
 * should use by default.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Middleware refreshes the session, so this is safe to swallow.
        }
      },
    },
  });
}

/**
 * Service-role client that BYPASSES RLS entirely.
 *
 * Only for operations that must read across trip boundaries before the caller
 * is known to be a member — specifically, resolving an invitation token to the
 * trip it belongs to. Never hand this client a user-supplied filter without
 * validating it first.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in user, or null. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
