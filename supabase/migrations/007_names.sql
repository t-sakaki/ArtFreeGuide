-- The editable copy of the multilingual name dictionary that used to live only
-- in src/lib/names.ts. The application still reads the checked in
-- src/lib/names.data.json, which scripts/sync_names.mjs writes from these
-- tables: permalinks and the sitemap are generated at build time, so a name has
-- to be fixed in the repository, not under a running deployment.
--
-- position keeps the row order of the file. It is meaningful: where two
-- spellings share one translation, the catalogue's own spelling is last, so a
-- translated name resolves back to it.
--
-- No policies are granted: only the server (service role) touches these tables.

create table if not exists public.artist_names (
  ja text primary key,
  en text not null,
  fr text not null,
  zh text not null,
  es text not null,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.artwork_names (
  ja text primary key,
  en text not null,
  fr text not null,
  zh text not null,
  es text not null,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

-- The title the guide speaks -> the title the catalogue and Wikipedia use.
create table if not exists public.title_aliases (
  spoken text primary key,
  catalogue text not null,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.artist_names enable row level security;
alter table public.artwork_names enable row level security;
alter table public.title_aliases enable row level security;
