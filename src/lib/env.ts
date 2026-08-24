/**
 * Environment access with loud failures.
 *
 * Missing env vars in a Next.js app usually surface as a confusing runtime error
 * three layers deep (`fetch failed`, `Invalid API key`). Reading them through
 * these helpers turns that into a single clear message naming the variable.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const supabaseUrl = () =>
  required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabaseAnonKey = () =>
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const supabaseServiceRoleKey = () =>
  required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);

export const googleMapsApiKey = () =>
  required('GOOGLE_MAPS_API_KEY', process.env.GOOGLE_MAPS_API_KEY);

/**
 * The public origin of this deployment. Every invite and magic link is built
 * from this, so getting it wrong sends people to the wrong host.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  // Vercel sets this automatically on preview deployments.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/**
 * Resend, but never by accident from a laptop.
 *
 * Every email this app sends — invitations, reminders, friend requests — goes
 * out through Resend from the server, in any environment. Mailpit only ever
 * catches Supabase's own auth mail, so a local test of the invite flow with a
 * real address sends a real email to a real person.
 *
 * Outside production the key is therefore ignored unless EMAIL_SEND_FOR_REAL=1
 * is set deliberately. Each sender falls back to logging the URL, which is what
 * you actually want while testing anyway.
 */
export const resendApiKey = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) return undefined;
  if (process.env.NODE_ENV === 'production') return key;
  if (process.env.EMAIL_SEND_FOR_REAL === '1') return key;
  return undefined;
};
export const emailFrom = () => process.env.EMAIL_FROM ?? 'Trip Booker <onboarding@resend.dev>';
