import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';

let client: SupabaseClient | null = null;

/**
 * One anon client per tab, created on first use: `createClient()` reads env at
 * call time and the pages using it are prerendered where those are not set.
 * Sharing the instance keeps a single auth session listener.
 */
export function browserClient(): SupabaseClient {
  if (!client) client = createClient();
  return client;
}
