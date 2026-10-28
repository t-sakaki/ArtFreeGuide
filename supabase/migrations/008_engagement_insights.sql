-- Closes the outer loop: not just "record a listen" but "know whether what
-- the listen fed into (a correction, a personalised recommendation) actually
-- helped." Two additions:
--
-- 1. A finer listening signal — which segment a visitor reached, not only how
--    many seconds — so a drop-off point can be found without a complaint.
-- 2. A record of every recommendation shown and taken, so click-through can
--    be compared across `basis` (plain similarity vs. taste-personalised).

alter table public.viewing_history add column if not exists segment_index integer;
alter table public.viewing_history add column if not exists segment_count integer;

-- The archive only changes at approval, not when the report was filed, so
-- this — not created_at — is the correct before/after cutover for measuring
-- whether a correction actually improved completion.
alter table public.guide_corrections add column if not exists resolved_at timestamptz;

create table if not exists public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles (id) on delete set null,
  kind text not null check (kind in ('impression', 'click')),
  basis text not null check (basis in ('artwork', 'blend', 'taste', 'none')),
  rec_title text not null,
  rec_artist text not null default '',
  source_title text not null default '',
  source_artist text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists recommendation_events_basis_kind_idx
  on public.recommendation_events (basis, kind, created_at);

-- No policies granted: only the server (service role) touches this table,
-- same as guide_corrections.
alter table public.recommendation_events enable row level security;
