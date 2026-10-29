import { describe, expect, it, vi } from 'vitest';
import { normalizeMeta } from '../../src/storage/progress';
import { normalizeSettings } from '../../src/storage/settings';

const DEFAULT_META = { best: 0, totalLines: 0, badges: [] };
const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  menuMusic: true,
  musicVol: 70,
  sfxVol: 80,
  haptics: true,
  ghost: true,
  fps: false,
  das: 167,
  arr: 33,
};

/** localStorage taklidi (yalnızca store.ts'in kullandığı getItem/setItem). */
function stubStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  const setItem = vi.fn((k: string, v: string) => {
    data.set(k, v);
  });
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem });
  return { data, setItem };
}

describe('fn_meta doğrulama', () => {
  it.each<[string, unknown]>([
    ['yok', undefined],
    ['null', null],
    ['sayı', 42],
    ['dizi', [1, 2]],
    ['metin', 'bozuk'],
  ])('kayıt %s ise varsayılan döner', (_name, raw) => {
    expect(normalizeMeta(raw)).toEqual(DEFAULT_META);
  });

  it('badges null ise boş diziye döner (NS4-01 F hatası)', () => {
    expect(normalizeMeta({ best: 1957, totalLines: 42, badges: null })).toEqual({
      best: 1957,
      totalLines: 42,
      badges: [],
    });
  });

  it.each<[string, unknown]>([
    ['negatif', -5],
    ['NaN benzeri metin', 'abc'],
    ['sayısal metin', '1957'],
    ['sonsuz', Infinity],
    ['NaN', NaN],
    ['nesne', {}],
    ['boolean', true],
  ])('best/totalLines %s ise 0 olur', (_name, v) => {
    expect(normalizeMeta({ best: v, totalLines: v, badges: [] })).toEqual(DEFAULT_META);
  });

  it('bilinmeyen rozetler filtrelenir, tekrarlar kaldırılır, sıra korunur', () => {
    expect(
      normalizeMeta({ best: 10, totalLines: 3, badges: ['noro', 'bilinmeyen', 'ozmotik', 'noro', 7, null] }),
    ).toEqual({ best: 10, totalLines: 3, badges: ['noro', 'ozmotik'] });
  });

  it('geçerli eski veri aynen korunur', () => {
    const legacy = { best: 1957, totalLines: 42, badges: ['ozmotik', 'noro'] };
    expect(normalizeMeta(legacy)).toEqual(legacy);
  });

  it('kısmen geçerli veride geçerli alanlar korunur, fazladan alanlar atılır', () => {
    expect(normalizeMeta({ best: 300, badges: ['derin'], extra: 1 })).toEqual({
      best: 300,
      totalLines: 0,
      badges: ['derin'],
    });
  });
});

describe('fn_settings doğrulama', () => {
  it.each<[string, unknown]>([
    ['yok', undefined],
    ['null', null],
    ['dizi', []],
    ['metin', 'x'],
  ])('kayıt %s ise varsayılan döner', (_name, raw) => {
    expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('geçerli kullanıcı ayarları aynen korunur', () => {
    const user = {
      sound: false,
      music: false,
      menuMusic: false,
      musicVol: 35,
      sfxVol: 100,
      haptics: false,
      ghost: false,
      fps: true,
      das: 50,
      arr: 0,
    };
    expect(normalizeSettings(user)).toEqual(user);
  });

  it('boolean olmayan alanlar varsayılana döner, geçerli alanlar korunur', () => {
    expect(normalizeSettings({ sound: 'false', music: false, haptics: 1, ghost: null, fps: true, das: 200 })).toEqual({
      ...DEFAULT_SETTINGS,
      music: false,
      fps: true,
      das: 200,
    });
  });

  it.each<[string, unknown, number]>([
    ['metin', '200', 167],
    ['NaN', NaN, 167],
    ['sonsuz', Infinity, 167],
    ['null', null, 167],
    ['alt sınırın altı', 10, 50],
    ['üst sınırın üstü', 1000, 300],
    ['kesirli', 120.6, 121],
  ])('DAS: %s (%s) → %i; arayüz aralığı 50..300', (_name, v, expected) => {
    expect(normalizeSettings({ das: v }).das).toBe(expected);
  });

  it.each<[string, unknown, number]>([
    ['metin', 'hızlı', 33],
    ['negatif', -4, 0],
    ['üst sınırın üstü', 250, 100],
    ['sıfır', 0, 0],
  ])('ARR: %s (%s) → %i; arayüz aralığı 0..100', (_name, v, expected) => {
    expect(normalizeSettings({ arr: v }).arr).toBe(expected);
  });

  it.each<[string, unknown, number]>([
    ['metin', 'yüksek', 70],
    ['negatif', -10, 0],
    ['üst sınırın üstü', 140, 100],
    ['kesirli', 42.4, 42],
  ])('NS4-39: müzik düzeyi %s (%s) → %i; aralık 0..100', (_name, v, expected) => {
    expect(normalizeSettings({ musicVol: v }).musicVol).toBe(expected);
  });

  it('NS4-39: eski kayıt (müzik düzeyi alanları yok) yeni varsayılanlarla tamamlanır, kullanıcı tercihi korunur', () => {
    const old = { sound: true, music: false, haptics: true, ghost: false, fps: false, das: 200, arr: 20 };
    expect(normalizeSettings(old)).toEqual({ ...DEFAULT_SETTINGS, ...old });
  });

  it('alan sırası kaydedilen JSON için sabittir, fazladan alanlar atılır', () => {
    expect(Object.keys(normalizeSettings({ arr: 10, zzz: 1, sound: false }))).toEqual(Object.keys(DEFAULT_SETTINGS));
  });
});

describe('NS4-41: ekrandan kaldırılan seçenekler', () => {
  it('titreşim, hayalet parça, DAS/ARR ve FPS her zaman varsayılan; ses ayarları korunur', async () => {
    const { withLockedDefaults, LOCKED_KEYS } = await import('../../src/storage/settings');
    const user = { ...DEFAULT_SETTINGS, haptics: false, ghost: false, fps: true, das: 60, arr: 0, musicVol: 20 };
    expect(withLockedDefaults(user)).toEqual({ ...DEFAULT_SETTINGS, musicVol: 20 });
    expect([...LOCKED_KEYS].sort()).toEqual(['arr', 'das', 'fps', 'ghost', 'haptics']);
  });
});

describe('localStorage yükleme', () => {
  it('bozuk fn_meta ile modül çökmeden yüklenir ve normalize veri yeniden kaydedilir', async () => {
    const { data, setItem } = stubStorage({ fn_meta: '{"best":1957,"totalLines":42,"badges":null}' });
    vi.resetModules();
    const { meta } = await import('../../src/storage/progress');
    expect(meta).toEqual({ best: 1957, totalLines: 42, badges: [] });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(data.get('fn_meta')).toBe('{"best":1957,"totalLines":42,"badges":[]}');
  });

  it('geçerli fn_meta ve fn_settings yeniden yazılmaz', async () => {
    const metaJson = '{"best":1957,"totalLines":42,"badges":["ozmotik","noro"]}';
    const settingsJson =
      '{"sound":true,"music":false,"menuMusic":true,"musicVol":50,"sfxVol":80,"haptics":true,"ghost":true,"fps":false,"das":167,"arr":33}';
    const { data, setItem } = stubStorage({ fn_meta: metaJson, fn_settings: settingsJson });
    vi.resetModules();
    const { meta } = await import('../../src/storage/progress');
    const { settings } = await import('../../src/storage/settings');
    expect(meta).toEqual(JSON.parse(metaJson));
    expect(settings).toEqual(JSON.parse(settingsJson));
    expect(setItem).not.toHaveBeenCalled();
    expect(data.get('fn_meta')).toBe(metaJson);
  });

  it('kayıt yoksa varsayılanlar kullanılır ve hiçbir şey yazılmaz', async () => {
    const { setItem } = stubStorage({});
    vi.resetModules();
    const { meta } = await import('../../src/storage/progress');
    const { settings } = await import('../../src/storage/settings');
    expect(meta).toEqual(DEFAULT_META);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('JSON olarak okunamayan kayıtta varsayılanlar kullanılır', async () => {
    stubStorage({ fn_meta: '{bozuk', fn_settings: 'nul' });
    vi.resetModules();
    const { meta } = await import('../../src/storage/progress');
    const { settings } = await import('../../src/storage/settings');
    expect(meta).toEqual(DEFAULT_META);
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('bozuk fn_settings normalize edilip yeniden kaydedilir', async () => {
    const { data } = stubStorage({ fn_settings: '{"sound":"evet","das":9999,"arr":20}' });
    vi.resetModules();
    const { settings } = await import('../../src/storage/settings');
    expect(settings).toEqual(DEFAULT_SETTINGS); // NS4-41: DAS/ARR artık varsayılanda sabit
    expect(JSON.parse(data.get('fn_settings') ?? 'null')).toEqual(settings);
  });

  it('NS4-41: kaldırılan seçeneği varsayılandan farklı eski kayıt bir kez varsayılanla yeniden yazılır', async () => {
    const old = { ...DEFAULT_SETTINGS, music: false, haptics: false, fps: true, das: 200 };
    const { data, setItem } = stubStorage({ fn_settings: JSON.stringify(old) });
    vi.resetModules();
    const { settings } = await import('../../src/storage/settings');
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, music: false });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(data.get('fn_settings') ?? 'null')).toEqual(settings);
  });

  it('rozet kazanımı bozuk eski veriden sonra çalışır', async () => {
    stubStorage({ fn_meta: '{"badges":null}' });
    vi.resetModules();
    const { meta } = await import('../../src/storage/progress');
    expect(() => meta.badges.includes('noro')).not.toThrow();
  });
});
