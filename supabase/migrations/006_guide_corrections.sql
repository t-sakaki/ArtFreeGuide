-- Guide fixes proposed from visitor feedback. A row holds the archived guide and
-- the rewritten one; approving it writes the rewrite back over the archive.
-- No policies are granted: only the server (service role) touches this table.

create table if not exists public.guide_corrections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null default '',
  locale text not null default 'ja',
  kind text not null,
  comment text not null,
  excerpt text,
  original text not null,
  proposal text not null,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamp with time zone default now()
);

create index if not exists guide_corrections_status_idx
  on public.guide_corrections (status, created_at);

alter table public.guide_corrections enable row level security;
