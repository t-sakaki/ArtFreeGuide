import { NextResponse } from 'next/server';

/**
 * The Supabase project URL and anon key for the browser. Both are public by
 * design (row level security is what protects the data), and they are served
 * at runtime because NEXT_PUBLIC_* values are only inlined into the client
 * bundle when they happen to be set on the machine that ran the build.
 */
export async function GET() {
  return NextResponse.json(
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
