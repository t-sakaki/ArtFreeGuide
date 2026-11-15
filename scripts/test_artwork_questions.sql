-- Run only against a disposable PostgreSQL DB after 009_artwork_questions.sql.
-- Supabase-compatible anon, authenticated and BYPASSRLS service_role roles required.
\set ON_ERROR_STOP on
begin;

do $$
begin
  if has_table_privilege('anon', 'public.artwork_questions', 'SELECT')
     or has_table_privilege('authenticated', 'public.artwork_questions', 'SELECT')
     or has_table_privilege('anon', 'public.artwork_questions', 'INSERT')
     or has_table_privilege('authenticated', 'public.artwork_questions', 'INSERT') then
    raise exception 'Browser roles must not access question memory';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.artwork_questions'::regclass) then
    raise exception 'RLS must be enabled';
  end if;
end;
$$;

set local role service_role;
insert into public.artwork_questions (title, artist, question)
values ('Test work', 'Artist A', 'Why blue?');
insert into public.artwork_questions (title, artist, question, last_asked_at)
values ('Test work', 'Artist A', 'Why blue?', now())
on conflict (title, artist, question) do update set last_asked_at = excluded.last_asked_at;
insert into public.artwork_questions (title, artist, question, last_asked_at)
values ('Other work', 'Artist B', 'Expired?', now() - interval '31 days');
insert into public.artwork_questions (title, artist, question)
values ('Test work', 'Artist B', 'Different artist?'), ('Other work', 'Artist A', 'Different work?');

do $$
begin
  if (select count(*) from public.artwork_questions where title = 'Test work' and artist = 'Artist A') <> 1 then
    raise exception 'Repeated questions must deduplicate and work/artist must remain distinct';
  end if;
  if exists (select 1 from public.artwork_questions where question = 'Expired?') then
    raise exception 'Expired questions must be physically purged on write';
  end if;
end;
$$;

insert into public.artwork_questions (title, artist, question, last_asked_at)
select 'Test work', 'Artist A', 'Question ' || n, now() - n * interval '1 hour'
from generate_series(1, 7) as n;

do $$
declare questions text[];
begin
  select array_agg(question order by last_asked_at desc) into questions
  from (
    select question, last_asked_at from public.artwork_questions
    where title = 'Test work' and artist = 'Artist A' and last_asked_at >= now() - interval '30 days'
    order by last_asked_at desc limit 5
  ) as recent;
  if questions <> array['Why blue?', 'Question 1', 'Question 2', 'Question 3', 'Question 4'] then
    raise exception 'Expected five newest questions for the exact work, got %', questions;
  end if;
end;
$$;
rollback;
\echo 'Question-memory database checks passed'
