import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/** Creates the profile row backing a browser-local anonymous user id. */
export async function POST() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('user_profiles')
      .insert({})
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ userId: data.id });
  } catch (error: any) {
    console.error('User registration error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
