-- Cache of generated guides so a second visitor to the same artwork gets the
-- narration instantly instead of waiting for the model.

create table if not exists public.artwork_guides (
  cache_key text primary key,
  title text not null,
  artist text not null default '',
  -- Raw JSON string exactly as the API returned it, kept text so the same
  -- payload round-trips through any backend (Supabase, D1, memory).
  payload text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artwork_guides_title_idx on public.artwork_guides (title);

alter table public.artwork_guides enable row level security;

-- Only the service role reads or writes this table; the browser never touches it.
