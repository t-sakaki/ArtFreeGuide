-- Visitor reported misreadings for the speech synthesiser.
-- Reports land as 'pending'; only 'approved' rows are layered over
-- src/data/readings.json at runtime.

create table if not exists public.pronunciation_corrections (
  id uuid primary key default gen_random_uuid(),
  original text not null,
  reading text not null,
  context text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamp with time zone default now()
);

create index if not exists pronunciation_corrections_status_idx
  on public.pronunciation_corrections (status, created_at desc);

alter table public.pronunciation_corrections enable row level security;

drop policy if exists "pronunciation_insert_all" on public.pronunciation_corrections;
create policy "pronunciation_insert_all"
  on public.pronunciation_corrections for insert with check (true);

drop policy if exists "pronunciation_select_all" on public.pronunciation_corrections;
create policy "pronunciation_select_all"
  on public.pronunciation_corrections for select using (true);
