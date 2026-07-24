-- Game history, stats, and per-user preference sync for MahjLogic.
--
-- Apply once in the Supabase Dashboard (no CLI required):
--   1. Open Project → SQL Editor → New query
--   2. Paste this entire file
--   3. Run
--
-- Frontend uses the anon/publishable key; RLS restricts rows to auth.uid().

-- ── game_results ─────────────────────────────────────────────────────────────

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  outcome text not null check (outcome in ('player_win', 'bot_win', 'dead_hand', 'wall_game')),
  card_id text not null,
  pattern_id text,
  hand_title text,
  hand_section text,
  card_hand_code text,
  points integer,
  closed boolean,
  win_method text check (win_method is null or win_method in ('self-draw', 'called-discard')),
  dead_hand_reason text,
  bot_difficulty text,
  ended_by text check (ended_by is null or ended_by in ('natural', 'manual_end'))
);

create index if not exists game_results_user_created_idx
  on public.game_results (user_id, created_at desc);

create index if not exists game_results_user_outcome_idx
  on public.game_results (user_id, outcome);

alter table public.game_results enable row level security;

drop policy if exists "game_results_select_own" on public.game_results;
create policy "game_results_select_own"
  on public.game_results
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "game_results_insert_own" on public.game_results;
create policy "game_results_insert_own"
  on public.game_results
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "game_results_delete_own" on public.game_results;
create policy "game_results_delete_own"
  on public.game_results
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ── user_preferences ─────────────────────────────────────────────────────────

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  prefs jsonb not null default '{}'::jsonb
);

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own"
  on public.user_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_preferences_insert_own" on public.user_preferences;
create policy "user_preferences_insert_own"
  on public.user_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own"
  on public.user_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
