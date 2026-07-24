-- Allow signed-in users to clear their own game history / stats.
--
-- Apply in Supabase Dashboard → SQL Editor → paste → Run.
-- Safe to re-run (DROP POLICY IF EXISTS).

drop policy if exists "game_results_delete_own" on public.game_results;
create policy "game_results_delete_own"
  on public.game_results
  for delete
  to authenticated
  using (auth.uid() = user_id);
