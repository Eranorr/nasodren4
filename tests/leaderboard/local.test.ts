// NS4-18: yerel skor listesi (fn_scores, sürümlü) ve takma ad hafızası. localStorage taklit edilir.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  vi.resetModules();
});
const mod = () => import('../../src/leaderboard/localScores');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry = (n: number, score: number, at = 1000 + n, extra: Record<string, unknown> = {}) => ({
  id: id(n),
  nickname: '',
  score,
  lines: 10,
  level: 2,
  durationSeconds: 60,
  recordedAt: at,
  submitted: false,
  ruleset: 'sinus-attack-spray-v1',
  ...extra,
});

describe('yerel ilk 10', () => {
  it('skor azalan sıralanır, en çok 10 kayıt tutulur; 10. altındaki yeni oyun listeye girmez', async () => {
    const m = await mod();
    for (let i = 1; i <= 12; i++) m.addLocalScore(entry(i, i * 100));
    const list = m.loadLocalScores();
    expect(list.map((e) => e.score)).toEqual([1200, 1100, 1000, 900, 800, 700, 600, 500, 400, 300]);
    expect(m.addLocalScore(entry(13, 50)).added).toBe(false);
    expect(m.addLocalScore(entry(14, 350)).added).toBe(true);
    expect(m.loadLocalScores().at(-1)?.score).toBe(350);
    expect(JSON.parse(data.get('fn_scores') ?? '{}')).toMatchObject({ v: 1 });
  });
  it('eşit skorda önce kaydedilen üstte (ulaşan önce), sonra kimlik', async () => {
    const m = await mod();
    m.addLocalScore(entry(3, 500, 3000));
    m.addLocalScore(entry(1, 500, 1000));
    m.addLocalScore(entry(2, 500, 1000));
    expect(m.loadLocalScores().map((e) => e.id)).toEqual([id(1), id(2), id(3)]);
  });
  it('aynı oyun iki kez eklenmez', async () => {
    const m = await mod();
    expect(m.addLocalScore(entry(1, 900)).added).toBe(true);
    expect(m.addLocalScore(entry(1, 900)).added).toBe(false);
    expect(m.addLocalScore({ ...entry(1, 5000) }).added).toBe(false);
    expect(m.loadLocalScores()).toHaveLength(1);
  });
  it('kayıt güncelleme: takma ad ve gönderildi işareti', async () => {
    const m = await mod();
    m.addLocalScore(entry(1, 900));
    m.updateLocalScore(id(1), { nickname: 'Ferah', submitted: true });
    m.updateLocalScore(id(9), { nickname: 'Yok' }); // olmayan kayıt: değişiklik yok
    expect(m.loadLocalScores()).toEqual([{ ...entry(1, 900), nickname: 'Ferah', submitted: true }]);
  });
});

describe('bozuk storage güvenle filtrelenir', () => {
  it.each([
    ['JSON değil', '{bozuk'],
    ['dizi', '[1,2]'],
    ['sürüm yok', '{"entries":[]}'],
    ['ileri sürüm', '{"v":2,"entries":[]}'],
    ['entries nesne', '{"v":1,"entries":{}}'],
  ])('%s → boş liste', async (_n, raw) => {
    data.set('fn_scores', raw);
    const m = await mod();
    expect(m.loadLocalScores()).toEqual([]);
  });
  it('geçersiz kayıtlar atılır, geçerliler korunur; tekrar eden kimlik bir kez', async () => {
    data.set(
      'fn_scores',
      JSON.stringify({
        v: 1,
        entries: [
          entry(1, 700),
          { ...entry(2, 600), score: -5 },
          { ...entry(3, 500), score: 'çok' },
          { ...entry(4, 400), level: 99 },
          { ...entry(5, 300), id: '<script>' },
          { ...entry(6, 200), nickname: '<b>x</b>' }, // kayıt korunur, takma ad boşalır
          { ...entry(7, 100), durationSeconds: Number.MAX_SAFE_INTEGER },
          entry(1, 700),
          null,
          'metin',
        ],
      }),
    );
    const m = await mod();
    expect(m.loadLocalScores().map((e) => [e.id, e.nickname])).toEqual([
      [id(1), ''],
      [id(6), ''],
    ]);
  });
});

describe('kural seti (sinus-attack-spray-v1; cyclamen-flow-v3, v2 ve v1 kayıtları korunur)', () => {
  /** Kural seti alanı olmayan eski (NS4-18) kayıt. */
  const legacy = (n: number, score: number) =>
    Object.fromEntries(Object.entries(entry(n, score)).filter(([k]) => k !== 'ruleset'));
  const stored = () => JSON.parse(data.get('fn_scores') ?? '{}') as { entries: Record<string, unknown>[] };

  it('eski kayıtlar (alan yok) silinmez ama güncel listede görünmez; legacy olarak ayrılır', async () => {
    data.set('fn_scores', JSON.stringify({ v: 1, entries: [legacy(1, 9000), legacy(2, 8000)] }));
    const m = await mod();
    expect(m.loadLocalScores()).toEqual([]);
    expect(m.normalizeLocalScores(JSON.parse(data.get('fn_scores') ?? '{}'), 'legacy').map((e) => e.id)).toEqual([
      id(1),
      id(2),
    ]);
    m.addLocalScore(entry(3, 100)); // yeni kural setinde ilk kayıt
    expect(m.loadLocalScores().map((e) => e.id)).toEqual([id(3)]);
    expect(
      stored()
        .entries.map((e) => e['id'])
        .sort(),
    ).toEqual([id(1), id(2), id(3)]); // eskiler korundu
    m.updateLocalScore(id(3), { submitted: true });
    expect(stored().entries).toHaveLength(3);
  });

  it('her kural seti kendi en iyi 10’unu tutar: yeni kayıtlar eskileri itip silmez', async () => {
    data.set(
      'fn_scores',
      JSON.stringify({ v: 1, entries: Array.from({ length: 10 }, (_, i) => legacy(100 + i, 50_000 + i)) }),
    );
    const m = await mod();
    for (let i = 1; i <= 12; i++) m.addLocalScore(entry(i, i * 100));
    expect(m.loadLocalScores()).toHaveLength(10);
    expect(m.loadLocalScores()[0]?.score).toBe(1200);
    const all = m.normalizeAllLocalScores(JSON.parse(data.get('fn_scores') ?? '{}'));
    expect(all.filter((e) => e.ruleset === 'legacy')).toHaveLength(10);
    expect(all.filter((e) => e.ruleset === 'sinus-attack-spray-v1')).toHaveLength(10);
  });

  it('önceki kural seti (cyclamen-flow-v1) kayıtları silinmez, kendi kural setinde kalır; listede görünmez', async () => {
    data.set(
      'fn_scores',
      JSON.stringify({
        v: 1,
        entries: [
          entry(1, 7000, 1, { ruleset: 'cyclamen-flow-v1' }),
          entry(4, 6000, 1, { ruleset: 'cyclamen-flow-v2' }),
          entry(5, 6500, 1, { ruleset: 'cyclamen-flow-v3' }),
        ],
      }),
    );
    const m = await mod();
    expect(m.loadLocalScores()).toEqual([]);
    m.addLocalScore(entry(2, 10));
    expect(m.loadLocalScores().map((e) => e.id)).toEqual([id(2)]);
    expect(stored().entries.map((e) => [e['id'], e['ruleset']])).toEqual([
      [id(1), 'cyclamen-flow-v1'],
      [id(5), 'cyclamen-flow-v3'],
      [id(4), 'cyclamen-flow-v2'],
      [id(2), 'sinus-attack-spray-v1'],
    ]);
  });

  it('bilinmeyen biçimli kural seti legacy sayılır; yeni kayıt kendi kural setini taşır', async () => {
    const m = await mod();
    expect(m.normalizeLocalScore({ ...entry(1, 5), ruleset: '<b>' })?.ruleset).toBe('legacy');
    expect(m.normalizeLocalScore(legacy(2, 5))?.ruleset).toBe('legacy');
    m.addLocalScore(entry(3, 7));
    expect(stored().entries[0]).toMatchObject({ ruleset: 'sinus-attack-spray-v1' });
  });
});

describe('fn_meta uyumluluğu', () => {
  it('yerel liste fn_meta.best ve diğer alanlara dokunmaz', async () => {
    data.set('fn_meta', '{"best":1957,"totalLines":42,"badges":["ozmotik"]}');
    const m = await mod();
    m.addLocalScore(entry(1, 5000));
    expect(data.get('fn_meta')).toBe('{"best":1957,"totalLines":42,"badges":["ozmotik"]}');
    const p = await import('../../src/storage/progress');
    expect(p.meta.best).toBe(1957);
  });
});

describe('takma ad hafızası ve oyun kimliği', () => {
  it('geçerli takma ad saklanır, geçersiz saklanmaz; bozuk kayıt boş döner', async () => {
    const n = await import('../../src/leaderboard/nickname');
    expect(n.loadNickname()).toBe('');
    n.saveNickname('  Ferah  Nefes ');
    expect(n.loadNickname()).toBe('Ferah Nefes');
    n.saveNickname('<x>');
    expect(n.loadNickname()).toBe('Ferah Nefes');
    data.set('fn_nickname', '"​gizli"');
    expect(n.loadNickname()).toBe('');
  });
  it('oyun kimliği UUID v4 (randomUUID yoksa da)', async () => {
    const n = await import('../../src/leaderboard/nickname');
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(n.newGameId()).toMatch(re);
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array<ArrayBuffer>) => real.getRandomValues(b) });
    const ids = new Set(Array.from({ length: 50 }, () => n.newGameId()));
    expect(ids.size).toBe(50);
    for (const x of ids) expect(x).toMatch(re);
  });
});
