import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Where the browser gets its Supabase credentials: the build-time NEXT_PUBLIC_*
 * values when the deploying build had them, otherwise the running worker via
 * /api/public-config. Without the fallback a deploy built without those
 * variables leaves sign-in throwing on first click.
 */
async function publicConfig(): Promise<{ url: string; anonKey: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) return { url, anonKey };

  const res = await fetch('/api/public-config');
  if (!res.ok) {
    throw new Error(`Supabase の設定を取得できませんでした (${res.status})`);
  }

  const data = (await res.json()) as { supabaseUrl?: string; supabaseAnonKey?: string };
  if (!data.supabaseUrl || !data.supabaseAnonKey) {
    throw new Error(
      'この環境では Supabase の設定 (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) が未設定のため、ログインを利用できません。'
    );
  }
  return { url: data.supabaseUrl, anonKey: data.supabaseAnonKey };
}

/**
 * One anon client per tab, created on first use. Sharing the instance keeps a
 * single auth session listener; a failed lookup is not cached so the next
 * attempt retries.
 */
export function browserClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = publicConfig()
      .then(({ url, anonKey }) => createSupabaseClient(url, anonKey))
      .catch(error => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}
