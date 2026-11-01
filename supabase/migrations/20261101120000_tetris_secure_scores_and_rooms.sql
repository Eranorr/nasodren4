-- =====================================================================
-- tetris: güvenli skor yazımı + sunucu tarafı oda üyeliği (ileri yönlü).
-- Önceki: 20261101000000_tetris_scores_baseline.sql (canlıda uygulanmış).
-- Veri silmez: DROP TABLE / TRUNCATE yok; yalnızca politika ve yetkiler
-- değişir, sütun / tablo / fonksiyon eklenir. Tekrar çalıştırmak güvenlidir.
--
-- 1. tetris_scores: tarayıcı (anon, authenticated) artık hiçbir şey yazamaz
--    ve tabloyu doğrudan okuyamaz. Yazma yalnızca tetris-submit-score Edge
--    Function'ın service role bağlantısıyla; okuma tetris_get_leaderboard RPC'si
--    (yalnızca gerekli sütunlar, en çok 10 satır).
-- 2. Tekrar gönderim: oyun kimliğinin tuzlu özeti (game_hash) benzersiz.
-- 3. Hız sınırı: tetris_rate_limits sayacı (anahtar: istemci adresinin tuzlu
--    özeti; ham adres saklanmaz; bir günden eski pencereler silinir).
-- 4. Çok oyunculu üyelik: tetris_rooms + tetris_room_members, yalnızca
--    tetris-room Edge Function erişir. Realtime kanalı public kalır; adı
--    tahmin edilemez oda kimliğinden türer (realtime.messages politikası yok).
--
-- Not: Supabase, public şemadaki yeni tablo ve fonksiyonlara varsayılan olarak
-- anon / authenticated yetkisi verir; bu yüzden her nesnede açıkça geri alınır.
--
-- Geri alma (rollback; veri kaybı yok, güvenliği ESKİ haline döndürür, önerilmez):
--   create policy "tetris_scores_select_all" on public.tetris_scores for select using (true);
--   grant select on public.tetris_scores to anon, authenticated;
--   (insert politikası baseline'daki gibi yeniden oluşturulabilir)
--   drop function if exists public.tetris_get_leaderboard(integer, text), public.tetris_score_rank(text, integer, bigint),
--     public.tetris_rate_hit(text, text, integer, integer), public.tetris_room_create(text, text, text, text),
--     public.tetris_room_join(text, text, text, text), public.tetris_room_member_key(uuid, uuid),
--     public.tetris_room_roster(uuid, uuid), public.tetris_room_leave(uuid, uuid);
--   Oda / hız sınırı tabloları geçici veridir; gerekirse panelden bilinçli olarak kaldırılır.
-- =====================================================================

-- ---------- 1. tetris_scores ----------
alter table public.tetris_scores add column if not exists duration_seconds integer;
alter table public.tetris_scores add column if not exists game_hash text;
alter table public.tetris_scores add column if not exists client_version text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tetris_scores_duration_range') then
    alter table public.tetris_scores
      add constraint tetris_scores_duration_range check (duration_seconds is null or duration_seconds between 1 and 21600);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tetris_scores_game_hash_fmt') then
    alter table public.tetris_scores
      add constraint tetris_scores_game_hash_fmt check (game_hash is null or game_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tetris_scores_client_version_fmt') then
    alter table public.tetris_scores
      add constraint tetris_scores_client_version_fmt
      check (client_version is null or client_version ~ '^[a-z0-9][a-z0-9._-]{0,31}$');
  end if;
end $$;

-- aynı oyun ikinci kez: benzersiz özet ihlali (PostgREST 409)
create unique index if not exists tetris_scores_game_hash_key on public.tetris_scores (game_hash);

alter table public.tetris_scores enable row level security;
alter table public.tetris_scores force row level security;
drop policy if exists "tetris_scores_insert_anyone" on public.tetris_scores;
drop policy if exists "tetris_scores_select_all" on public.tetris_scores;
revoke all on table public.tetris_scores from public, anon, authenticated;
revoke all on sequence public.tetris_scores_id_seq from public, anon, authenticated;
grant select, insert on table public.tetris_scores to service_role;
grant usage, select on sequence public.tetris_scores_id_seq to service_role;

-- okuma: yalnızca gerekli sütunlar, kural seti içinde, en çok 10 satır
create or replace function public.tetris_get_leaderboard(
  limit_count integer default 10,
  ruleset_name text default 'cyclamen-flow-v2'
)
returns table (id bigint, rank bigint, name text, score integer, lines integer, level smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, row_number() over (order by s.score desc, s.id asc) as rank, s.name, s.score, s.lines, s.level
  from public.tetris_scores s
  where s.ruleset = ruleset_name
  order by s.score desc, s.id asc
  limit least(greatest(coalesce(limit_count, 10), 1), 10);
$$;
revoke all on function public.tetris_get_leaderboard(integer, text) from public, anon, authenticated;
grant execute on function public.tetris_get_leaderboard(integer, text) to anon, authenticated, service_role;

-- gönderilen skorun sırası (yalnızca Edge Function)
create or replace function public.tetris_score_rank(p_ruleset text, p_score integer, p_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) + 1
  from public.tetris_scores s
  where s.ruleset = p_ruleset and (s.score > p_score or (s.score = p_score and s.id < p_id));
$$;
revoke all on function public.tetris_score_rank(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.tetris_score_rank(text, integer, bigint) to service_role;

-- ---------- 2. hız sınırı ----------
create table if not exists public.tetris_rate_limits (
  key          text not null check (key ~ '^[0-9a-f]{64}$'),
  bucket       text not null check (char_length(bucket) between 1 and 32),
  window_start bigint not null,
  hits         integer not null default 0,
  primary key (key, bucket, window_start)
);
alter table public.tetris_rate_limits enable row level security;
alter table public.tetris_rate_limits force row level security;
revoke all on table public.tetris_rate_limits from public, anon, authenticated;

create or replace function public.tetris_rate_hit(p_key text, p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w bigint := (floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)::bigint;
  n integer;
begin
  insert into public.tetris_rate_limits as r (key, bucket, window_start, hits)
  values (p_key, p_bucket, w, 1)
  on conflict (key, bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  -- bir günden eski sayaçlar (kişisel veri değil; tuzlu özet) ara sıra temizlenir
  if random() < 0.02 then
    delete from public.tetris_rate_limits where window_start < extract(epoch from now())::bigint - 86400;
  end if;
  return n <= p_max;
end;
$$;
revoke all on function public.tetris_rate_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.tetris_rate_hit(text, text, integer, integer) to service_role;

-- ---------- 3. oda üyeliği ----------
create table if not exists public.tetris_rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null check (code ~ '^[ABCDEFGHJKLMNPRSTUVYZ2-9]{4}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);
create unique index if not exists tetris_rooms_code_key on public.tetris_rooms (code);

create table if not exists public.tetris_room_members (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.tetris_rooms (id) on delete cascade,
  name      text not null check (char_length(name) between 3 and 16),
  color     smallint not null check (color between 0 and 2),
  pub_x     text not null check (pub_x ~ '^[A-Za-z0-9_-]{43}$'),
  pub_y     text not null check (pub_y ~ '^[A-Za-z0-9_-]{43}$'),
  joined_at timestamptz not null default clock_timestamp(),
  seen_at   timestamptz not null default clock_timestamp(),
  left_at   timestamptz
);
create index if not exists tetris_room_members_room_idx on public.tetris_room_members (room_id);

alter table public.tetris_rooms enable row level security;
alter table public.tetris_rooms force row level security;
alter table public.tetris_room_members enable row level security;
alter table public.tetris_room_members force row level security;
revoke all on table public.tetris_rooms from public, anon, authenticated;
revoke all on table public.tetris_room_members from public, anon, authenticated;

-- etkin üye: ayrılmamış ve son 75 sn içinde nabız göndermiş
create or replace function public.tetris_room_create(p_code text, p_name text, p_x text, p_y text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r uuid;
  m uuid;
begin
  -- süresi dolmuş ya da kimsenin kalmadığı odanın kodu yeniden kullanılabilir (geçici veri; üyeler cascade)
  delete from public.tetris_rooms t
  where t.code = p_code
    and (t.expires_at < now() or not exists (
      select 1 from public.tetris_room_members x
      where x.room_id = t.id and x.left_at is null and x.seen_at > now() - interval '75 seconds'));
  insert into public.tetris_rooms (code) values (p_code) on conflict (code) do nothing returning id into r;
  if r is null then
    return jsonb_build_object('status', 'taken');
  end if;
  insert into public.tetris_room_members (room_id, name, color, pub_x, pub_y)
  values (r, p_name, 0, p_x, p_y) returning id into m;
  return jsonb_build_object('status', 'ok', 'room_id', r, 'player_id', m, 'color', 0);
end;
$$;

create or replace function public.tetris_room_join(p_code text, p_name text, p_x text, p_y text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tetris_rooms;
  n integer;
  c smallint;
  m uuid;
begin
  -- satır kilidi: aynı anda katılanlar sırayla işlenir (en çok 3 üye, renk benzersiz)
  select * into t from public.tetris_rooms where code = p_code and expires_at > now() for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select count(*) into n from public.tetris_room_members x
  where x.room_id = t.id and x.left_at is null and x.seen_at > now() - interval '75 seconds';
  if n = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;
  if n >= 3 then
    return jsonb_build_object('status', 'full');
  end if;
  select min(g)::smallint into c from generate_series(0, 2) g
  where g not in (select x.color from public.tetris_room_members x
                  where x.room_id = t.id and x.left_at is null and x.seen_at > now() - interval '75 seconds');
  insert into public.tetris_room_members (room_id, name, color, pub_x, pub_y)
  values (t.id, p_name, c, p_x, p_y) returning id into m;
  return jsonb_build_object('status', 'ok', 'room_id', t.id, 'player_id', m, 'color', c);
end;
$$;

create or replace function public.tetris_room_member_key(p_room uuid, p_player uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('x', x.pub_x, 'y', x.pub_y)
  from public.tetris_room_members x
  where x.id = p_player and x.room_id = p_room and x.left_at is null
    and x.seen_at > now() - interval '75 seconds';
$$;

create or replace function public.tetris_room_roster(p_room uuid, p_player uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tetris_room_members set seen_at = clock_timestamp()
  where id = p_player and room_id = p_room and left_at is null;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'name', x.name, 'color', x.color, 'x', x.pub_x, 'y', x.pub_y,
      'joinedAt', (extract(epoch from x.joined_at) * 1000)::bigint) order by x.joined_at, x.id)
    from public.tetris_room_members x
    where x.room_id = p_room and x.left_at is null and x.seen_at > now() - interval '75 seconds'), '[]'::jsonb);
end;
$$;

create or replace function public.tetris_room_leave(p_room uuid, p_player uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tetris_room_members set left_at = now()
  where id = p_player and room_id = p_room and left_at is null;
$$;

revoke all on function public.tetris_room_create(text, text, text, text) from public, anon, authenticated;
revoke all on function public.tetris_room_join(text, text, text, text) from public, anon, authenticated;
revoke all on function public.tetris_room_member_key(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tetris_room_roster(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tetris_room_leave(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tetris_room_create(text, text, text, text) to service_role;
grant execute on function public.tetris_room_join(text, text, text, text) to service_role;
grant execute on function public.tetris_room_member_key(uuid, uuid) to service_role;
grant execute on function public.tetris_room_roster(uuid, uuid) to service_role;
grant execute on function public.tetris_room_leave(uuid, uuid) to service_role;
