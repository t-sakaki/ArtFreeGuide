import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { PROFILE_EMBEDDING_COLUMN } from '@/lib/embeddings';
import type { SupabaseClient } from '@supabase/supabase-js';

interface ProfileRow {
  id: string;
  auth_user_id: string | null;
  view_count: number;
  favorite_tags: string[] | null;
  preference_embedding: unknown;
}

const PROFILE_COLUMNS = `id, auth_user_id, view_count, favorite_tags, preference_embedding:${PROFILE_EMBEDDING_COLUMN}`;

/**
 * Fold the browser's anonymous profile into the signed-in one: history moves
 * across, counters add up, and the taste vector is kept only when the account
 * does not have one yet. The anonymous row then goes away.
 */
async function merge(supabase: SupabaseClient, account: ProfileRow, anonymous: ProfileRow) {
  await supabase
    .from('viewing_history')
    .update({ user_id: account.id })
    .eq('user_id', anonymous.id);

  const tags = Array.from(
    new Set([...(account.favorite_tags ?? []), ...(anonymous.favorite_tags ?? [])])
  );

  const update: Record<string, unknown> = {
    view_count: (account.view_count ?? 0) + (anonymous.view_count ?? 0),
    favorite_tags: tags
  };
  if (!account.preference_embedding && anonymous.preference_embedding) {
    update[PROFILE_EMBEDDING_COLUMN] = anonymous.preference_embedding;
  }

  await supabase.from('user_profiles').update(update).eq('id', account.id);
  await supabase.from('user_profiles').delete().eq('id', anonymous.id);
}

/**
 * Resolve the profile a signed-in visitor should use. Called right after a
 * magic link lands, so the guides heard anonymously are not lost.
 */
export async function POST(req: Request) {
  try {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: auth, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { anonymousUserId } = await req.json().catch(() => ({ anonymousUserId: null }));

    const { data: account } = await supabase
      .from('user_profiles')
      .select(PROFILE_COLUMNS)
      .eq('auth_user_id', auth.user.id)
      .maybeSingle<ProfileRow>();

    const { data: anonymous } =
      typeof anonymousUserId === 'string' && anonymousUserId
        ? await supabase
            .from('user_profiles')
            .select(PROFILE_COLUMNS)
            .eq('id', anonymousUserId)
            .maybeSingle<ProfileRow>()
        : { data: null };

    // First sign-in on this account: claim the anonymous row instead of
    // starting an empty profile, so nothing has to be copied.
    if (!account) {
      if (anonymous && !anonymous.auth_user_id) {
        const { error } = await supabase
          .from('user_profiles')
          .update({ auth_user_id: auth.user.id })
          .eq('id', anonymous.id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ userId: anonymous.id, merged: false });
      }

      const { data: created, error } = await supabase
        .from('user_profiles')
        .insert({ auth_user_id: auth.user.id })
        .select('id')
        .single<{ id: string }>();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ userId: created.id, merged: false });
    }

    const mergeable = anonymous && anonymous.id !== account.id && !anonymous.auth_user_id;
    if (mergeable) {
      await merge(supabase, account, anonymous);
    }

    return NextResponse.json({ userId: account.id, merged: Boolean(mergeable) });
  } catch (error: any) {
    console.error('Auth link API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
