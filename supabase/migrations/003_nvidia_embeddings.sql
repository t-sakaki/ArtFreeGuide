-- Second embedding space alongside the Workers AI bge-m3 one.
-- NVIDIA NIM nvidia/llama-nemotron-embed-1b-v2 (dimensions=1024) writes here so
-- the existing `embedding` / `preference_embedding` columns stay usable and the
-- app can switch back with EMBEDDING_PROVIDER alone.

alter table public.artworks add column if not exists embedding_nv vector(1024);
alter table public.user_profiles add column if not exists preference_embedding_nv vector(1024);

create index if not exists artworks_embedding_nv_idx
  on public.artworks using ivfflat (embedding_nv vector_cosine_ops) with (lists = 100);

create or replace function public.match_artworks_nv(
  query_embedding vector(1024),
  match_threshold double precision default 0.25,
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
    1 - (a.embedding_nv <=> query_embedding) as similarity
  from public.artworks a
  where a.embedding_nv is not null
    and 1 - (a.embedding_nv <=> query_embedding) >= match_threshold
  order by a.embedding_nv <=> query_embedding
  limit match_count;
$$;
