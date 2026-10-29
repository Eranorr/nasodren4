// Ayarlar ekranı bağlama: [data-k] girişleri ↔ ayar nesnesi. Her değişiklik anında kaydedilir.
// Kalıcılık ve ses güncellemesi dışarıdan verilir (storage/audio modüllerini bilmez).
// NS4-39: müzik / efekt düzeyi kaydırıcıları (%), menü ve mola müziği; bağlı kontroller ana anahtar kapalıyken
// devre dışı. Molada ve menüde müzik çaldığı için düzey değişikliği hemen duyulur.
// NS4-41: ekranda yalnızca Ses grubu var (titreşim, hayalet parça, DAS/ARR, FPS varsayılan değerlerinde sabit).
import { $ } from './dom';
import { isBooleanSettingKey, isNumericSettingKey } from '../storage/settings';
import type { NumericSettingKey, Settings } from '../types/settings';

export interface SettingsPanelDeps {
  readonly settings: Settings;
  readonly save: () => void;
  /** Ses ayarı değişti (`key`: değişen ayar; efekt düzeyinde örnek ses çalınabilir). */
  readonly onAudioChange: (key: AudioSettingKey) => void;
}

export type AudioSettingKey = 'sound' | 'music' | 'menuMusic' | 'musicVol' | 'sfxVol';
const AUDIO_KEYS: readonly string[] = [
  'sound',
  'music',
  'menuMusic',
  'musicVol',
  'sfxVol',
] satisfies readonly AudioSettingKey[];
function isAudioKey(k: string): k is AudioSettingKey {
  return AUDIO_KEYS.includes(k);
}

/** Kaydırıcı değerinin görünür metni ve ekran okuyucu metni. */
export const VALUE_TEXT: Readonly<Record<NumericSettingKey, (v: number) => readonly [shown: string, spoken: string]>> =
  {
    musicVol: (v) => [`%${v}`, `yüzde ${v}`],
    sfxVol: (v) => [`%${v}`, `yüzde ${v}`],
    das: (v) => [String(v), `${v} ms`],
    arr: (v) => [String(v), `${v} ms`],
  };
/** Ana anahtarı kapalıyken devre dışı kalan kontroller. */
const DEPENDS: Readonly<Partial<Record<string, keyof Settings>>> = {
  musicVol: 'music',
  menuMusic: 'music',
  sfxVol: 'sound',
};

export function bindSettingsPanel({ settings, save, onAudioChange }: SettingsPanelDeps): void {
  const inputs: HTMLInputElement[] = [];
  const syncDisabled = () => {
    for (const inp of inputs) {
      const dep = DEPENDS[inp.dataset['k'] ?? ''];
      if (!dep) continue;
      inp.disabled = !settings[dep];
      inp.closest('.set')?.classList.toggle('off', inp.disabled);
    }
  };
  document.querySelectorAll('#scr-set [data-k]').forEach((inp) => {
    if (!(inp instanceof HTMLInputElement)) return;
    // data-k bir DOM değeridir: yalnızca bilinen ayar anahtarları bağlanır (index.html'deki bütün girişler bilinir)
    const k = inp.dataset['k'];
    const isBool = isBooleanSettingKey(k),
      isNum = isNumericSettingKey(k);
    if (!isBool && !isNum) return;
    inputs.push(inp);
    if (inp.type === 'checkbox') inp.checked = !!settings[k];
    else inp.value = String(settings[k]);
    const lbl = () => {
      if (!isNum) return;
      const [shown, spoken] = VALUE_TEXT[k](settings[k]);
      $('v-' + k).textContent = shown;
      // NS4-17: kaydırıcı değeri ekran okuyucuda birimiyle okunur
      inp.setAttribute('aria-valuetext', spoken);
    };
    lbl();
    inp.addEventListener('input', () => {
      // checkbox → boolean ayar, range → sayısal ayar (index.html'de tür ve anahtar eşleşir)
      if (inp.type === 'checkbox') {
        if (isBool) settings[k] = inp.checked;
      } else if (isNum) settings[k] = +inp.value;
      save();
      lbl();
      syncDisabled();
      if (isAudioKey(k)) onAudioChange(k);
      if (k === 'fps') $('fps').style.display = settings.fps ? 'block' : 'none';
    });
  });
  syncDisabled();
  $('fps').style.display = settings.fps ? 'block' : 'none';
}
