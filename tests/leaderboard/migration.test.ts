// Migration zinciri (ileri yönlü), yetkiler / RLS, Edge Function kaynağı ve secret hijyeni için statik sözleşme testleri.
import { describe, expect, it } from 'vitest';
import baseline from '../../supabase/migrations/20261101000000_tetris_scores_baseline.sql?raw';
import secure from '../../supabase/migrations/20261101120000_tetris_secure_scores_and_rooms.sql?raw';
import v3 from '../../supabase/migrations/20261102000000_tetris_ruleset_v3.sql?raw';
import { RULESET } from '../../supabase/functions/_shared/scoreRules.ts';
import envProduction from '../../.env.production?raw';
import envExample from '../../.env.local.example?raw';
import gitignore from '../../.gitignore?raw';
import pkg from '../../package.json';
import submitIndex from '../../supabase/functions/tetris-submit-score/index.ts?raw';
import roomIndex from '../../supabase/functions/tetris-room/index.ts?raw';

const sources = import.meta.glob<string>('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true });
const migrations = import.meta.glob<string>('../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const sql = (s: string) => s.replace(/--.*$/gm, '').replace(/\s+/g, ' '); // yorumlar hariç, tek boşluk
const code = sql(secure);
const FUNCS = [
  'tetris_score_rank(text, integer, bigint)',
  'tetris_rate_hit(text, text, integer, integer)',
  'tetris_room_create(text, text, text, text)',
  'tetris_room_join(text, text, text, text)',
  'tetris_room_member_key(uuid, uuid)',
  'tetris_room_roster(uuid, uuid)',
  'tetris_room_leave(uuid, uuid)',
];

describe('migration zinciri', () => {
  it('ileri yönlü zincir, sıralı; tek kaynak schema.sql yok', () => {
    expect(Object.keys(migrations).map((f) => f.split('/').pop())).toEqual([
      '20261101000000_tetris_scores_baseline.sql',
      '20261101120000_tetris_secure_scores_and_rooms.sql',
      '20261102000000_tetris_ruleset_v3.sql',
    ]);
  });
  it('v3: okuma RPC varsayılanı güncel kural seti; yetkiler aynı; veri silinmez', () => {
    const c = sql(v3);
    expect(RULESET).toBe('cyclamen-flow-v3');
    expect(c).toContain(
      `create or replace function public.tetris_get_leaderboard( limit_count integer default 10, ruleset_name text default '${RULESET}' )`,
    );
    expect(c).toContain("security definer set search_path = ''");
    expect(c).toContain('limit least(greatest(coalesce(limit_count, 10), 1), 10)');
    expect(c).toContain(
      'revoke all on function public.tetris_get_leaderboard(integer, text) from public, anon, authenticated;',
    );
    expect(c).not.toMatch(/drop table|truncate|delete from|grant [^;]*(insert|update|delete)/i);
    expect(v3).toContain('Geri alma (rollback)');
  });
  it('veri kaybı yok: DROP TABLE / TRUNCATE / DELETE FROM tetris_scores kullanılmaz', () => {
    for (const s of [sql(baseline), code, sql(v3)]) {
      expect(s).not.toMatch(/drop table|truncate/i);
      expect(s).not.toMatch(/delete from public\.tetris_scores/i);
    }
  });
  it('baseline canlıda elle uygulanan kurulumdur ve güvenli olmadığı işaretlidir; ileri migration geri alma notu içerir', () => {
    expect(baseline).toMatch(/SQL Editor ile canlı/);
    expect(baseline).toMatch(/GÜVENLİ DEĞİL/);
    expect(secure).toMatch(/Geri alma \(rollback/);
  });
});

describe('tetris_scores: tarayıcı yazamaz, okuma yalnızca RPC', () => {
  it('RLS açık ve zorunlu; tarayıcı politikaları kaldırılır; anon/authenticated tüm yetkiler geri alınır', () => {
    expect(code).toContain('alter table public.tetris_scores force row level security;');
    expect(code).toContain('drop policy if exists "tetris_scores_insert_anyone" on public.tetris_scores;');
    expect(code).toContain('drop policy if exists "tetris_scores_select_all" on public.tetris_scores;');
    expect(code).toContain('revoke all on table public.tetris_scores from public, anon, authenticated;');
    expect(code).toContain('revoke all on sequence public.tetris_scores_id_seq from public, anon, authenticated;');
    expect(code).toContain('grant select, insert on table public.tetris_scores to service_role;');
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/grant [^;]*(insert|update|delete|all)[^;]* to [^;]*(anon|authenticated)/i);
  });
  it('tekrar gönderim engeli: game_hash benzersiz ve biçimli', () => {
    expect(code).toContain(
      'create unique index if not exists tetris_scores_game_hash_key on public.tetris_scores (game_hash);',
    );
    expect(code).toContain("game_hash ~ '^[0-9a-f]{64}$'");
  });
  it('okuma RPC: security definer, boş arama yolu, yalnızca gerekli sütunlar, en çok 10, kural seti varsayılanı v2', () => {
    expect(code).toContain(
      "create or replace function public.tetris_get_leaderboard( limit_count integer default 10, ruleset_name text default 'cyclamen-flow-v2' )",
    );
    expect(code).toContain(
      'returns table (id bigint, rank bigint, name text, score integer, lines integer, level smallint)',
    );
    const fn = /tetris_get_leaderboard\([\s\S]*?\$\$([\s\S]*?)\$\$/.exec(code)?.[1] ?? '';
    expect(fn).toContain('where s.ruleset = ruleset_name');
    expect(fn).toContain('limit least(greatest(coalesce(limit_count, 10), 1), 10)');
    expect(fn).not.toMatch(/game_hash|duration_seconds|client_version|created_at/);
    expect(code).toContain(
      'grant execute on function public.tetris_get_leaderboard(integer, text) to anon, authenticated, service_role;',
    );
  });
  it('diğer bütün fonksiyonlar yalnızca service_role (anon/authenticated geri alınır); hepsi security definer + search_path', () => {
    for (const f of FUNCS) {
      expect(code, f).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
      expect(code, f).toContain(`grant execute on function public.${f} to service_role;`);
    }
    const defs = code.match(/create or replace function/g) ?? [];
    expect((code.match(/security definer set search_path = ''/g) ?? []).length).toBe(defs.length);
  });
  it('oda ve hız sınırı tabloları: RLS zorunlu, tarayıcı yetkisi yok, politika yok', () => {
    for (const t of ['tetris_rate_limits', 'tetris_rooms', 'tetris_room_members']) {
      expect(code, t).toContain(`alter table public.${t} force row level security;`);
      expect(code, t).toContain(`revoke all on table public.${t} from public, anon, authenticated;`);
    }
  });
  it('oda üyeliği: satır kilidi, en çok 3 etkin üye, benzersiz renk, 75 sn nabız', () => {
    expect(code).toContain('for update');
    expect(code).toContain("if n >= 3 then return jsonb_build_object('status', 'full');");
    expect(code).toContain('select min(g)::smallint into c from generate_series(0, 2) g');
    expect(code).toContain("seen_at > now() - interval '75 seconds'");
  });
  it('kişisel veri sütunu yok (IP, user-agent, e-posta, hesap)', () => {
    expect(code).not.toMatch(/\b(ip|ip_address|user_agent|email|user_id)\b/i);
  });
});

describe('Edge Function kaynakları', () => {
  it('service role yalnızca function ortamından; yazma tetris_scores ve RPC ile', () => {
    for (const s of [submitIndex, roomIndex]) {
      expect(s).toMatch(/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
      expect(s).not.toMatch(/console\.(log|error)/);
    }
    expect(submitIndex).toContain("db.rest('tetris_scores?select=id'");
  });
});

describe('ortam dosyaları ve secret hijyeni', () => {
  const vars = (s: string) => [...s.matchAll(/^([A-Z_]+)=(.*)$/gm)].map((m) => [m[1], m[2]]);
  it('.env.production: yalnızca URL ve publishable anahtar (tek standart ad)', () => {
    const v = vars(envProduction);
    expect(v.map((x) => x[0])).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']);
    expect(v[0]?.[1]).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    expect(v[1]?.[1]).toMatch(/^sb_publishable_/);
    expect(envProduction).not.toMatch(/sb_secret_|service_role|eyJ|password|JWT_SECRET/i);
  });
  it('.env.local.example yer tutucu; .env.local yok sayılır', () => {
    expect(vars(envExample)).toEqual([
      ['VITE_SUPABASE_URL', 'https://xxxx.supabase.co'],
      ['VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_xxxx'],
    ]);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^!\.env\.production$/m);
    expect(gitignore).toMatch(/^!\.env\.local\.example$/m);
  });
  it('kaynakta service role / secret anahtar yok; tabloya doğrudan yazma yok; SDK yalnızca dinamik import', () => {
    for (const [file, src] of Object.entries(sources)) {
      expect(src, file).not.toMatch(/SERVICE_ROLE|sb_secret_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20,}/);
      expect(src, file).not.toMatch(/rest\/v1\/tetris_scores|from\(['"`]tetris_scores/);
      expect(src, file).not.toMatch(/^import \{[^}]*\} from '@supabase\/supabase-js'/m); // değer importu yok (yalnızca tip)
    }
    expect(sources['../../src/supabase.ts']).toContain("import('@supabase/supabase-js')");
    expect(pkg.dependencies['@supabase/supabase-js']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
