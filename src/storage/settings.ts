// Kullanıcı ayarları (fn_settings). Uygulama boyunca tek bir nesne kullanılır;
// ayar paneli bu nesneyi yerinde günceller, diğer sistemler onu okur.
import { store } from './store';
import type { BooleanSettingKey, NumericSettingKey, Settings } from '../types/settings';

/** Varsayılan ayarlar (alan sırası kaydedilen JSON'un sırasını belirler). */
export function createDefaultSettings(): Settings {
  return {
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
}

const BOOLEAN_KEYS: readonly string[] = [
  'sound',
  'music',
  'menuMusic',
  'haptics',
  'ghost',
  'fps',
] satisfies readonly BooleanSettingKey[];
const NUMERIC_KEYS: readonly string[] = ['musicVol', 'sfxVol', 'das', 'arr'] satisfies readonly NumericSettingKey[];

/** Ayarlar ekranındaki kaydırıcıların sınırları (index.html: min/max, step 1). */
export const NUMERIC_RANGES: Readonly<Record<NumericSettingKey, readonly [min: number, max: number]>> = {
  musicVol: [0, 100],
  sfxVol: [0, 100],
  das: [50, 300],
  arr: [0, 100],
};

/**
 * NS4-06: fn_settings doğrulaması. Kayıt nesne değilse varsayılanlar döner. Boolean alanlar yalnızca gerçek
 * boolean ise alınır. DAS/ARR sonlu sayı değilse varsayılana döner; sonlu ama arayüz aralığı dışındaysa
 * sınıra çekilir ve tamsayıya yuvarlanır (kaydırıcı adımı 1). Fazladan alanlar taşınmaz; alan sırası
 * varsayılanlarınkiyle aynıdır. Geçerli kayıt aynı değerlerle döner.
 */
export function normalizeSettings(raw: unknown): Settings {
  const s = createDefaultSettings();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return s;
  const r: Partial<Record<keyof Settings, unknown>> = raw;
  for (const k of ['sound', 'music', 'menuMusic', 'haptics', 'ghost', 'fps'] as const) {
    const v = r[k];
    if (typeof v === 'boolean') s[k] = v;
  }
  for (const k of ['musicVol', 'sfxVol', 'das', 'arr'] as const) {
    const v = r[k];
    const [min, max] = NUMERIC_RANGES[k];
    if (typeof v === 'number' && Number.isFinite(v)) s[k] = Math.min(max, Math.max(min, Math.round(v)));
  }
  return s;
}

/**
 * Kayıtlı değeri okur ve doğrular. Okunan kayıt normalize edilince değiştiyse düzeltilmiş hâli hemen geri
 * yazılır; geçerli kayıtlar ve kayıt yokken depoya dokunulmaz.
 */
/**
 * NS4-41: Ayarlar ekranından kaldırılan seçenekler (Oynanış ve İleri ayarlar). Arayüzde değiştirilemedikleri için
 * kayıtlı değer yok sayılır ve varsayılan kullanılır: daha önce titreşimi kapatmış ya da FPS göstergesini açmış bir
 * oyuncu o durumda kilitli kalmaz. Alanlar kayıt şemasında kalır (ileride geri eklenebilir).
 */
export const LOCKED_KEYS = ['haptics', 'ghost', 'fps', 'das', 'arr'] as const satisfies readonly (keyof Settings)[];
export function withLockedDefaults(s: Settings): Settings {
  const d = createDefaultSettings();
  return { ...s, haptics: d.haptics, ghost: d.ghost, fps: d.fps, das: d.das, arr: d.arr };
}

function loadSettings(): Settings {
  const raw = store.get('settings', null);
  const s = withLockedDefaults(normalizeSettings(raw));
  if (raw !== null && JSON.stringify(raw) !== JSON.stringify(s)) store.set('settings', s);
  return s;
}

export const settings: Settings = loadSettings();

export function saveSettings(): void {
  store.set('settings', settings);
}

/** DOM `data-k` değerleri gibi dış kaynaklı anahtarlar için tip koruyucuları. */
export function isBooleanSettingKey(k: string | undefined): k is BooleanSettingKey {
  return k !== undefined && BOOLEAN_KEYS.includes(k);
}
export function isNumericSettingKey(k: string | undefined): k is NumericSettingKey {
  return k !== undefined && NUMERIC_KEYS.includes(k);
}
