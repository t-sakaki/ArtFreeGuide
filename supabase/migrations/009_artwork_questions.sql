-- Shared, short-lived questions actually submitted to /api/ask.
-- Deliberately no visitor ID, IP, email, answer or guide body.
create table if not exists public.artwork_questions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 256),
  artist text not null default '' check (char_length(artist) <= 128),
  question text not null check (char_length(question) between 1 and 500),
  last_asked_at timestamptz not null default now(),
  unique (title, artist, question)
);

create index if not exists artwork_questions_work_recent_idx
  on public.artwork_questions (title, artist, last_asked_at desc);
create index if not exists artwork_questions_expiry_idx
  on public.artwork_questions (last_asked_at);

-- Only server service-role calls may read or write the shared memory.
-- No public HTTP endpoint or browser Supabase policies expose raw questions.
alter table public.artwork_questions enable row level security;
revoke all on public.artwork_questions from anon, authenticated;
grant select, insert, update, delete on public.artwork_questions to service_role;

-- Expired entries are never returned by the reader. Physical cleanup happens
-- on the next write, even if that write is for a different artwork. An idle
-- installation needs a scheduled cleanup if a strict physical 30-day TTL is required.
create or replace function public.purge_expired_artwork_questions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.artwork_questions
  where last_asked_at < now() - interval '30 days';
  return null;
end;
$$;

revoke all on function public.purge_expired_artwork_questions() from public;
drop trigger if exists purge_expired_artwork_questions on public.artwork_questions;
create trigger purge_expired_artwork_questions
  after insert or update on public.artwork_questions
  for each statement execute function public.purge_expired_artwork_questions();
