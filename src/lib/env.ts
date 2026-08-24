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

/** Resend is optional in dev — see sendInviteEmail's console fallback. */
export const resendApiKey = () => process.env.RESEND_API_KEY;
export const emailFrom = () => process.env.EMAIL_FROM ?? 'Trip Booker <onboarding@resend.dev>';
