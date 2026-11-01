-- =====================================================================
-- BASELINE (canlıda uygulanmış durum): tetris_scores ilk kurulumu.
-- Bu dosya 2026-11-01 tarihinde Supabase panelindeki SQL Editor ile canlı
-- projeye elle uygulandı (CLI migration geçmişine yazılmadı). Değiştirilmeden
-- saklanır; tekrar çalıştırmak güvenlidir (if not exists / drop policy if exists).
-- GÜVENLİ DEĞİL: tarayıcıya doğrudan INSERT izni verir. Hemen ardından gelen
-- 20261101120000_tetris_secure_scores_and_rooms.sql bu izni kaldırır.
-- Geri alma: drop table if exists public.tetris_scores; (veri kaybı: yalnızca
-- bilinçli olarak, panelden).
-- =====================================================================

create table if not exists public.tetris_scores (
  id         bigint generated always as identity primary key,
  name       text not null,
  score      integer not null,
  lines      integer not null default 0,
  level      smallint not null default 1,
  ruleset    text not null,
  created_at timestamptz not null default now(),
  constraint tetris_scores_name_len check (char_length(name) between 3 and 16),
  constraint tetris_scores_score_range check (score between 0 and 10000000),
  constraint tetris_scores_lines_range check (lines between 0 and 5000),
  constraint tetris_scores_level_range check (level between 1 and 20),
  constraint tetris_scores_level_lines check (level = least(20, 1 + lines / 10)),
  constraint tetris_scores_ruleset_fmt check (ruleset ~ '^[a-z0-9][a-z0-9._-]{0,31}$')
);

-- kural seti içinde skor azalan; eşitlikte önce kaydedilen
create index if not exists tetris_scores_rank_idx on public.tetris_scores (ruleset, score desc, id);

alter table public.tetris_scores enable row level security;

drop policy if exists "tetris_scores_select_all" on public.tetris_scores;
create policy "tetris_scores_select_all" on public.tetris_scores
  for select using (true);

-- Herkes yeni skor ekleyebilir; güncelleme/silme politikası yok (= varsayılan red).
drop policy if exists "tetris_scores_insert_anyone" on public.tetris_scores;
create policy "tetris_scores_insert_anyone" on public.tetris_scores
  for insert with check (
    char_length(name) between 3 and 16
    and score between 0 and 10000000
    and lines between 0 and 5000
    and level = least(20, 1 + lines / 10)
  );
