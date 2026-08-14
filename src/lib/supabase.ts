import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is not set. Please check your .env.local configuration.`);
  }
  return value;
}

/**
 * Browser/anon client. Only ever sees data allowed by row level security.
 */
export function createClient(): SupabaseClient {
  return createSupabaseClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
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
