-- =====================================================================
-- Sıklamen çekirdeği kural seti (cyclamen-flow-v1): global skorlar kural setine göre ayrılır.
-- Bkz. docs/CYCLAMEN-CORE-V3-FINAL.md.
--   * leaderboard_scores.ruleset: yeni gönderimler submit-score doğrulamasıyla yalnızca 'cyclamen-flow-v1' olur;
--     sütundan önce eklenmiş satırlar 'legacy' sayılır (silinmez, güncel tabloda görünmez).
--   * get_leaderboard(limit_count, ruleset_name): yalnızca istenen kural setinin sıralaması (varsayılan güncel).
--   * Okunan alanlar değişmedi (rank, takma ad, skor, drenaj, seviye); kişisel veri yok.
--
-- Geri alma (rollback):
--   drop function if exists public.get_leaderboard(integer, text);
--   drop index if exists public.leaderboard_scores_ruleset_rank_idx;
--   alter table public.leaderboard_scores drop column if exists ruleset;
--   ardından 20261018000000_ns4_18_leaderboard.sql içindeki get_leaderboard(integer) yeniden oluşturulur.
-- =====================================================================

alter table public.leaderboard_scores
  add column if not exists ruleset text not null default 'legacy';

alter table public.leaderboard_scores
  add constraint leaderboard_scores_ruleset_chk check (ruleset in ('legacy', 'cyclamen-flow-v1'));

-- sıralama kural seti içinde: skor azalan; eşitlikte önce ulaşan (created_at artan), sonra id
create index if not exists leaderboard_scores_ruleset_rank_idx
  on public.leaderboard_scores (ruleset, score desc, created_at asc, id asc);

-- eski tek parametreli okuma kaldırılır (kural seti ayrımı olmadan sıralama yapmasın)
drop function if exists public.get_leaderboard(integer);

-- Güvenli okuma: yalnızca gerekli alanlar, en çok 50 satır, tek kural seti
create or replace function public.get_leaderboard(
  limit_count integer default 10,
  ruleset_name text default 'cyclamen-flow-v1'
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
  'Global ilk N (varsayılan 10, en çok 50), tek kural seti (varsayılan cyclamen-flow-v1): rank, nickname, score, lines, level.';

revoke all on function public.get_leaderboard(integer, text) from public;
grant execute on function public.get_leaderboard(integer, text) to anon, authenticated, service_role;
