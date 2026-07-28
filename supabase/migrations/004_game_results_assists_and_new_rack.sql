-- Finish-rate / assist markers for game_results.
--
-- Apply once in the Supabase Dashboard (no CLI required):
--   1. Open Project → SQL Editor → New query
--   2. Paste this entire file
--   3. Run
--
-- Adds:
--   - outcome 'new_rack' for mid-hand New Game / redeals (not a win/loss)
--   - assists text[] for helper tools used during a finished hand

-- Drop the existing outcome check (inline from 001 is usually game_results_outcome_check).
alter table public.game_results
  drop constraint if exists game_results_outcome_check;

-- If the auto-name differed, drop any remaining check that mentions outcome.
do $$
declare
  r record;
begin
  for r in
    select con.conname as cname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'game_results'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%outcome%'
  loop
    execute format('alter table public.game_results drop constraint %I', r.cname);
  end loop;
end $$;

alter table public.game_results
  add constraint game_results_outcome_check
  check (outcome in ('player_win', 'bot_win', 'dead_hand', 'wall_game', 'new_rack'));

alter table public.game_results
  add column if not exists assists text[] not null default '{}';
