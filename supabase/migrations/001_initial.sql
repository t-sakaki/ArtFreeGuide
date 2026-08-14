-- ArtFreeGuide initial schema
-- Artwork catalogue + per-user profile/history, with pgvector similarity search.

create extension if not exists "vector";
create extension if not exists "pgcrypto";

-- Embeddings are produced by Workers AI @cf/baai/bge-m3 (1024 dimensions).
create table if not exists public.artworks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_en text,
  artist text not null,
  artist_en text,
  year_created text,
  medium text,
  style text,
  museum text,
  country text,
  description text,
  image_url text,
  search_query text,
  tags text[] not null default '{}',
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title, artist)
);

create index if not exists artworks_artist_idx on public.artworks (artist);
create index if not exists artworks_tags_idx on public.artworks using gin (tags);
create index if not exists artworks_embedding_idx
  on public.artworks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  preferred_language text not null default 'ja',
  default_depth text not null default 'standard' check (default_depth in ('short', 'standard', 'deep')),
  playback_speed numeric(3, 2) not null default 1.0 check (playback_speed between 0.5 and 3.0),
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- artwork_id is null when the guide was generated for a free-text query that
-- is not (yet) in the catalogue; artwork_query keeps what the user asked for.
create table if not exists public.viewing_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  artwork_id uuid references public.artworks (id) on delete set null,
  artwork_query text not null,
  depth text not null default 'standard' check (depth in ('short', 'standard', 'deep')),
  listened_seconds integer not null default 0 check (listened_seconds >= 0),
  completed boolean not null default false,
  viewed_at timestamptz not null default now()
);

create index if not exists viewing_history_user_viewed_at_idx
  on public.viewing_history (user_id, viewed_at desc);
create index if not exists viewing_history_artwork_idx on public.viewing_history (artwork_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists artworks_set_updated_at on public.artworks;
create trigger artworks_set_updated_at
  before update on public.artworks
  for each row execute function public.set_updated_at();

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- Cosine similarity search over the catalogue. Rows without an embedding are skipped.
create or replace function public.match_artworks(
  query_embedding vector(1024),
  match_threshold double precision default 0.5,
  match_count integer default 5
)
returns table (
  id uuid,
  title text,
  artist text,
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
    a.description,
    a.image_url,
    1 - (a.embedding <=> query_embedding) as similarity
  from public.artworks a
  where a.embedding is not null
    and 1 - (a.embedding <=> query_embedding) >= match_threshold
  order by a.embedding <=> query_embedding
  limit match_count;
$$;

alter table public.artworks enable row level security;
alter table public.user_profiles enable row level security;
alter table public.viewing_history enable row level security;

-- The catalogue is public content; writes go through the service role key.
drop policy if exists "artworks are readable by everyone" on public.artworks;
create policy "artworks are readable by everyone"
  on public.artworks for select
  using (true);

drop policy if exists "users manage their own profile" on public.user_profiles;
create policy "users manage their own profile"
  on public.user_profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "users manage their own history" on public.viewing_history;
create policy "users manage their own history"
  on public.viewing_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
