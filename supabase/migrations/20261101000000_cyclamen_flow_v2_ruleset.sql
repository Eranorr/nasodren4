-- =====================================================================
-- Kural seti cyclamen-flow-v2: Sıklamen gücü çekirdeği destekler (alttaki 10 sırayı silmez).
-- Bkz. docs/CYCLAMEN-POWER-CORE-SUPPORT-FINAL.md.
--   * leaderboard_scores.ruleset: 'cyclamen-flow-v2' de kabul edilir; 'legacy' ve 'cyclamen-flow-v1' satırları silinmez
--     (güncel tabloda görünmez). Yeni gönderimler submit-score doğrulamasıyla yalnızca 'cyclamen-flow-v2' olur.
--   * get_leaderboard(limit_count, ruleset_name): varsayılan kural seti 'cyclamen-flow-v2'; alanlar ve üst sınır aynı.
--
-- Geri alma (rollback):
--   20261031000000_cyclamen_flow_ruleset.sql içindeki kısıt ve get_leaderboard(integer, text) yeniden oluşturulur
--   (önce 'cyclamen-flow-v2' satırları 'legacy' yapılmalı ya da silinmelidir).
-- =====================================================================

alter table public.leaderboard_scores
  drop constraint if exists leaderboard_scores_ruleset_chk;

alter table public.leaderboard_scores
  add constraint leaderboard_scores_ruleset_chk
  check (ruleset in ('legacy', 'cyclamen-flow-v1', 'cyclamen-flow-v2'));

-- varsayılan parametre değişir: fonksiyon yeniden oluşturulur
drop function if exists public.get_leaderboard(integer, text);

-- Güvenli okuma: yalnızca gerekli alanlar, en çok 50 satır, tek kural seti
create or replace function public.get_leaderboard(
  limit_count integer default 10,
  ruleset_name text default 'cyclamen-flow-v2'
)
returns table (rank bigint, nickname text, score integer, lines integer, level smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (order by s.score desc, s.created_at asc, s.id asc) as rank,
         s.nickname, s.score, s.lines, s.level
  from public.leaderboard_scores as s
  where s.ruleset = ruleset_name
  order by s.score desc, s.created_at asc, s.id asc
  limit least(greatest(coalesce(limit_count, 10), 1), 50);
$$;

comment on function public.get_leaderboard(integer, text) is
  'Global ilk N (varsayılan 10, en çok 50), tek kural seti (varsayılan cyclamen-flow-v2): rank, nickname, score, lines, level.';

revoke all on function public.get_leaderboard(integer, text) from public;
grant execute on function public.get_leaderboard(integer, text) to anon, authenticated, service_role;
