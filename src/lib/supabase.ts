import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

function requireValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} environment variable is not set. Please check your .env.local configuration.`);
  }
  return value;
}

function requireEnv(name: string): string {
  return requireValue(name, process.env[name]);
}

/**
 * Browser/anon client. Only ever sees data allowed by row level security.
 * The env reads are written out in full: the bundler inlines NEXT_PUBLIC_*
 * only for literal `process.env.X`, so a dynamic lookup is undefined in a
 * browser.
 */
export function createClient(): SupabaseClient {
  return createSupabaseClient(
    requireValue('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireValue('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/**
 * Server-only client using the service role key: bypasses row level security,
 * so it must never be imported from client components.
 */
export function createServiceClient(): SupabaseClient {
  return createSupabaseClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}
