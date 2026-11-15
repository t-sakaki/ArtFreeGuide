-- Optional sign-in on top of the anonymous-profile model: a profile row can be
-- claimed by a Supabase Auth user, so history and taste follow the account
-- across devices. Profiles without auth_user_id stay anonymous as before.

alter table public.user_profiles
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;

create unique index if not exists user_profiles_auth_user_id_key
  on public.user_profiles (auth_user_id)
  where auth_user_id is not null;
