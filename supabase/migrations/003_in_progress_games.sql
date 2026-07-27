-- In-progress game autosave for signed-in players (resume after reload).
--
-- Apply in the Supabase Dashboard (no CLI required):
--   1. Open Project → SQL Editor → New query
--   2. Paste this entire file
--   3. Run
--
-- One row per user; upserted as the hand progresses; cleared on finish or New Game.

create table if not exists public.in_progress_games (
  user_id uuid primary key references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  schema_version integer not null default 1,
  state jsonb not null
);

alter table public.in_progress_games enable row level security;

drop policy if exists "in_progress_games_select_own" on public.in_progress_games;
create policy "in_progress_games_select_own"
  on public.in_progress_games
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "in_progress_games_insert_own" on public.in_progress_games;
create policy "in_progress_games_insert_own"
  on public.in_progress_games
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "in_progress_games_update_own" on public.in_progress_games;
create policy "in_progress_games_update_own"
  on public.in_progress_games
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "in_progress_games_delete_own" on public.in_progress_games;
create policy "in_progress_games_delete_own"
  on public.in_progress_games
  for delete
  to authenticated
  using (auth.uid() = user_id);
