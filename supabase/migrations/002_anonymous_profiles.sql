-- Switch to the anonymous-user model: the app has no login, so profiles are
-- rows created on demand from the browser and identified by a localStorage id.

alter table public.user_profiles drop constraint if exists user_profiles_id_fkey;
alter table public.user_profiles alter column id set default gen_random_uuid();
alter table public.user_profiles add column if not exists preference_embedding vector(1024);
alter table public.user_profiles add column if not exists favorite_tags text[] not null default '{}';
alter table public.user_profiles add column if not exists view_count integer not null default 0;

alter table public.viewing_history drop constraint if exists viewing_history_user_id_fkey;
alter table public.viewing_history
  add constraint viewing_history_user_id_fkey
  foreign key (user_id) references public.user_profiles (id) on delete cascade;
alter table public.viewing_history alter column artwork_query drop not null;

-- No auth means auth.uid() is always null; ids are unguessable uuids instead.
drop policy if exists "users manage their own profile" on public.user_profiles;
drop policy if exists "users manage their own history" on public.viewing_history;

create policy "profiles_read_all" on public.user_profiles for select using (true);
create policy "profiles_insert_all" on public.user_profiles for insert with check (true);
create policy "profiles_update_all" on public.user_profiles for update using (true) with check (true);
create policy "history_read_all" on public.viewing_history for select using (true);
create policy "history_insert_all" on public.viewing_history for insert with check (true);

-- Recommendation cards show the year, so return it from the search function.
drop function if exists public.match_artworks(vector, double precision, integer);
create function public.match_artworks(
  query_embedding vector(1024),
  match_threshold double precision default 0.5,
  match_count integer default 5
)
returns table (
  id uuid,
  title text,
  artist text,
  year text,
  description text,
  image_url text,
  similarity double precision
)
language sql
stable
as $$
  select
    a.id,
    a.title,
    a.artist,
    a.year_created as year,
    a.description,
    a.image_url,
    1 - (a.embedding <=> query_embedding) as similarity
  from public.artworks a
  where a.embedding is not null
    and 1 - (a.embedding <=> query_embedding) >= match_threshold
  order by a.embedding <=> query_embedding
  limit match_count;
$$;
