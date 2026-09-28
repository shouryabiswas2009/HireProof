-- Run this in the Supabase SQL editor for the HireProof project.
--
-- One table. A saved check keeps the score and enough context to
-- recognise it later; the posting text itself is never stored, because
-- keeping a bookmark should not mean uploading somebody's paste.

create table if not exists public.checks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  title       text,
  score       double precision not null,
  band        text not null,
  word_count  integer,
  top_signal  text
);

create index if not exists checks_user_created_idx
  on public.checks (user_id, created_at desc);

-- ROW-LEVEL SECURITY IS THE ACTUAL PROTECTION.
--
-- The proxy redirecting a signed-out visitor to /login is a convenience:
-- it keeps people out of pages that would be empty. It is not security,
-- because the anon key is public and anyone can query the API directly.
-- These policies are what make one person's history unreadable to
-- another, and they are enforced by Postgres rather than by the app.
alter table public.checks enable row level security;

create policy "own checks are readable"
  on public.checks for select
  using (auth.uid() = user_id);

create policy "own checks are insertable"
  on public.checks for insert
  with check (auth.uid() = user_id);

create policy "own checks are deletable"
  on public.checks for delete
  using (auth.uid() = user_id);
