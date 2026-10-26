// NS4-08: tek görsel tema ve tasarım tokenları için kalıcı, statik sözleşme testleri.
// Hesaplanmış stillerin açık/koyu sistem tercihinde aynı olması headless tarayıcı smoke'unda ölçülür
// (bkz. docs/NS4-08-SINGLE-THEME-DESIGN-SYSTEM.md); burada kaynak kuralları ve token kontrastları korunur.
import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import { createDefaultSettings, normalizeSettings } from '../../src/storage/settings';
import css from '../../src/styles.css?raw';

const sources = import.meta.glob<string>('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

/** Yorumları atılmış CSS. */
const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Seçici listesi tam olarak `selector` olan ilk kuralın gövdesi (@media içindekiler dahil değil). */
function rule(selector: string): string {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  let depth = 0;
  let start = 0;
  for (let i = 0; i < plain.length; i++) {
    const ch = plain[i];
    if (ch === '{') {
      if (depth === 0) {
        const sel = norm(plain.slice(start, i));
        const end = plain.indexOf('}', i);
        if (sel === norm(selector)) return plain.slice(i + 1, end);
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) start = i + 1;
    } else if (ch === ';' && depth === 0) start = i + 1;
  }
  throw new Error('kural yok: ' + selector);
}

function tokens(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of rule(':root').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1] ?? '', (m[2] ?? '').trim());
  return out;
}
function token(name: string): string {
  const v = tokens().get(name);
  if (v === undefined) throw new Error('token yok: ' + name);
  // tek düzey var() takma adlarını çöz
  const alias = /^var\((--[\w-]+)\)$/.exec(v);
  return alias?.[1] ? token(alias[1]) : v;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error('hex renk değil: ' + hex);
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
}
function contrast(fg: string, bg: string): number {
  const a = luminance(token(fg)),
    b = luminance(token(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('tek tema', () => {
  it('prefers-color-scheme ve data-theme kullanılmıyor', () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/data-theme/);
    expect(html).not.toMatch(/data-theme/);
    for (const [file, src] of Object.entries(sources)) {
      // NS4-15: tek izinli medya sorgusu hareket tercihidir (src/app/motion.ts); tema sorgusu yok
      expect(src, file).not.toMatch(/prefers-color-scheme|data-theme/);
      expect(src.replaceAll('matchMedia(REDUCED_MOTION_QUERY)', ''), file).not.toMatch(/matchMedia\s*\(/);
    }
    expect(sources['../../src/app/motion.ts'] ?? '').toContain(
      "export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';",
    );
  });

  it('renk şeması tek temaya sabit (CSS ve meta)', () => {
    expect(rule(':root')).toMatch(/color-scheme:\s*only light;/);
    expect(html).toMatch(/<meta name="color-scheme" content="only light" \/>/);
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}" \/>/i);
  });

  it('tema için localStorage alanı veya ayarı yok', () => {
    expect(Object.keys(createDefaultSettings())).not.toContain('theme');
    expect(Object.keys(normalizeSettings({ theme: 'dark' }))).not.toContain('theme');
    expect(html).not.toMatch(/data-k="theme"/);
    for (const [file, src] of Object.entries(sources)) {
      for (const m of src.matchAll(/store\.(?:get|set)\(\s*'([^']+)'/g))
        expect(['meta', 'settings'], file).toContain(m[1]);
    }
  });
});

describe('tasarım tokenları', () => {
  const REQUIRED = [
    // arka plan, metin, panel
    '--color-bg-top',
    '--color-bg-bottom',
    '--color-text',
    '--color-text-muted',
    '--color-on-accent',
    '--color-surface',
    '--color-surface-strong',
    '--color-border',
    // oyun alanı
    '--color-board',
    '--color-board-grid',
    // vurgular ve durumlar
    '--color-cyclamen',
    '--color-cyclamen-strong',
    '--color-cyclamen-soft',
    '--color-fresh',
    '--color-fresh-strong',
    '--color-success',
    '--color-warning',
    '--color-danger',
    '--color-danger-strong',
    '--color-danger-soft',
    // butonlar ve odak
    '--color-btn-bg',
    '--color-btn-text',
    '--color-btn-locked-bg',
    '--color-btn-locked-text',
    '--color-focus-ring',
    // gölge, köşe, süre, tipografi
    '--shadow-control',
    '--shadow-float',
    '--shadow-sheet',
    '--shadow-board',
    '--radius-control',
    '--radius-button',
    '--radius-panel',
    '--radius-sheet',
    '--radius-pill',
    '--dur-press',
    '--dur-fade',
    '--font-display',
    '--font-body',
  ];

  it('temel tokenlar :root içinde tanımlı', () => {
    const t = tokens();
    for (const name of REQUIRED) expect(t.has(name), name).toBe(true);
  });

  it('eski tema değişkenleri kaldırıldı', () => {
    expect(css).not.toMatch(
      /var\(--(bg-a|bg-b|ink|muted|panel|panel-line|board|board-line|cyc|teal|warn|sheet|sheet-ink|btn|btn-ink|font-d|font-b)\)/,
    );
  });

  it.each([
    ['--color-text', '--color-surface-strong', 7],
    ['--color-text-muted', '--color-surface-strong', 4.5],
    ['--color-text-muted', '--color-bg-top', 4.5],
    ['--color-btn-text', '--color-btn-bg', 7],
    ['--color-btn-locked-text', '--color-btn-locked-bg', 4.5],
    ['--color-on-accent', '--color-cyclamen', 4.5],
    ['--color-on-accent', '--color-fresh-strong', 4.5],
    ['--color-on-accent', '--color-danger', 4.5],
    ['--color-cyclamen-strong', '--color-btn-bg', 4.5],
    ['--color-cyclamen-strong', '--color-btn-locked-bg', 4.5],
    ['--color-danger-strong', '--color-btn-bg', 4.5],
    ['--color-danger-strong', '--color-btn-locked-bg', 4.5],
    ['--color-fresh-strong', '--color-bg-top', 3],
  ])('%s üzerinde/ile %s kontrastı ≥ %f', (fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('sıklamen, hapşırık ve tehlike renkleri ayırt edilebilir tonlarda', () => {
    const hue = (name: string) => {
      const n = parseInt(token(name).slice(1), 16);
      const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        d = max - min;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const apart = (a: string, b: string) => {
      const diff = Math.abs(hue(a) - hue(b));
      return Math.min(diff, 360 - diff);
    };
    expect(apart('--color-cyclamen', '--color-danger')).toBeGreaterThanOrEqual(30);
    expect(apart('--color-sneeze', '--color-danger')).toBeGreaterThanOrEqual(30);
    expect(apart('--color-sneeze', '--color-cyclamen')).toBeGreaterThanOrEqual(30);
  });
});

describe('bileşen kuralları', () => {
  it('kilitli buton düşük opaklıkla değil, kendi yüzey ve metin rengiyle gösterilir', () => {
    const body = rule('.gbtn[disabled]');
    const op = /(?:^|;)\s*opacity:\s*([\d.]+)/.exec(body);
    expect(op === null || Number(op[1]) >= 0.6).toBe(true);
    expect(body).toMatch(/background:\s*var\(--color-btn-locked-bg\)/);
    expect(body).toMatch(/color:\s*var\(--color-btn-locked-text\)/);
  });

  it('güçlendirici durumları (aktif, kullanıldı, doluyor) ayrı stillere sahip', () => {
    for (const sel of [
      "#btn-cyc[data-state='active']",
      "#btn-cyc[data-state='used']",
      "#btn-sneeze[data-state='charging']",
    ])
      expect(rule(sel).length, sel).toBeGreaterThan(0);
    expect(rule("#btn-cyc[data-state='active']")).toMatch(/--color-cyclamen/);
    expect(rule("#btn-sneeze[data-state='charging']")).toMatch(/--color-sneeze/);
    expect(rule('.gbtn .charge i')).toMatch(/background:\s*var\(--color-sneeze\)/);
  });

  it('focus-visible görünür odak halkasını korur', () => {
    const body = rule('.gbtn:focus-visible, .btn:focus-visible, a:focus-visible, input:focus-visible');
    expect(body).toMatch(/outline:\s*3px solid var\(--color-focus-ring\)/);
    expect(body).toMatch(/outline-offset:\s*2px/);
  });

  it('CTA, birincil buton ve rozetler vurgu tokenlarını kullanır', () => {
    expect(rule('.btn.primary')).toMatch(/background:\s*var\(--color-cyclamen\)/);
    expect(rule('.btn.cta')).toMatch(/background:\s*var\(--color-fresh-strong\)/);
    expect(rule('#badge-mult')).toMatch(/background:\s*var\(--color-cyclamen\)/);
  });
});
