// NS4-16: yardımcı ekranlar (Mola, Ayarlar, Nasıl oynanır, Oyun sonu) ve tipografi. Statik sözleşmeler (index.html,
// styles.css) + sahte DOM üzerinde gerçek ekran/lifecycle akışı. Gerçek yerleşim, taşma ve kaydırma 7 viewport'ta
// headless tarayıcıda ölçülür (bkz. docs/NS4-16-SUPPORTING-SCREENS-AND-TYPOGRAPHY.md).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import { ctaUrl } from '../../src/analytics/cta';
import { CFG } from '../../src/config/gameConfig';
import { BADGE_IDS } from '../../src/content/badges';
import { computeLayout } from '../../src/rendering/layout';
import { HUD_SCALE_MAX, hudScale } from '../../src/ui/hud';
import { badgeState } from '../../src/ui/badges';
import { mediaBlock, plainCss, rule } from '../helpers/css';
import { createAppStubs } from '../helpers/appStubs';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { createGame } from '../helpers/gameHelpers';

const sources = import.meta.glob<string>('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

const section = (id: string) => {
  const a = html.indexOf(`<section id="${id}"`);
  return html.slice(a, html.indexOf('\n      </section>', a));
};
/** Görünür metin (yorum, SVG ve etiketler atılır; boşluklar normalleşir). */
const text = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const at = (s: string, needle: string) => {
  const i = s.indexOf(needle);
  if (i < 0) throw new Error('yok: ' + needle);
  return i;
};
/** NS4-18: oyun sonu global gönderim formu. */
const FORM_RE = /<form class="submit-score"[\s\S]*?<\/form>/;
const how = section('scr-how'),
  pause = section('scr-pause'),
  over = section('scr-over'),
  set = section('scr-set');

describe('NS4-15 izinsiz metni kaldırıldı', () => {
  it('“Puan ×2 · 30 sn · sıklamen tek kullanımlık” hiçbir kaynakta ve sayfada yok', () => {
    for (const [file, src] of Object.entries(sources)) expect(src, file).not.toMatch(/Puan ×2|tek kullanımlık/);
    expect(html).not.toMatch(/Puan ×2|tek kullanımlık/);
  });
  it('onaylı sıklamen başlangıç popup’ı ve ×2 rozeti metni duruyor', () => {
    expect(sources['../../src/app/events.ts']).toContain("popup('Sıklamen özütü', 'Ozmotik drenaj başladı', 'cyc')");
    expect(sources['../../src/ui/hud.ts']).toContain('`Ferah nefes ×2 · ${m} sn`');
  });
});

describe('görünür metinler değişmedi (a67fe7f)', () => {
  it.each([
    [
      'scr-pause',
      pause,
      'Mola Devam et Ayarlar Ana menü Sinüs sağlığı rehberi', // ipucu metni çalışma anında doldurulur
    ],
    [
      'scr-over',
      over,
      'Yeni rekor Sinüslerin tamamen tıkandı 0 Puan 0 Drenaj 0 Rekor Gerçek hayatta tıkanıklıkla yaşamak zorunda değilsin. Sinüzit ve rahat nefes hakkında güvenilir bilgiler sağlık portalında. Rahat nefes rehberini aç Tekrar oyna Ana menü',
    ],
    [
      'scr-how',
      how,
      'Nasıl oynanır Dokunmatik Sağa-sola sürükle Bloğu kaydır Dokun Döndür (tahtanın sol üçte biri: ters yön) Aşağı sürükle Yavaşça indir Aşağı fırlat Anında bırak Yukarı fırlat Beklet Klavye ← → Kaydır ↑ / X · Z Döndür · ters döndür ↓ · Boşluk Yavaş indir · anında bırak C / Shift Beklet 1 · 2 Sıklamen özütü · hapşırık Esc / P Duraklat Oyun alanı bir sinüs boşluğu Düşen bloklar biriken mukus; alan dolarsa sinüs tamamen tıkanır. Oyun dört sinüs odasından geçer: yanak, gözler arası, alın ve kafa tabanı. Her oda gri bulutçuklarla başlar; hepsini temizleyince sinüs açılır. Sonra serbest nefes. Tam satır = drenaj. Dört satır birden: ozmotik etki. T-spin: nörorefleks etki. Tıkanıklık yükselince iki destek açılır. Sıklamen özütü oyunda bir kez kullanılır, alt yarıyı yavaşça boşaltır ve 30 sn puanları ikiye katlar. Hapşırık tıkanıklığın en üstteki 3 sırasını savurur. 20 blok yerleştirince yeniden dolar. Tamam Öğreticiyle oyna',
    ],
  ])('%s', (_id, sec, expected) => {
    // NS4-18: oyun sonundaki global gönderim formu ayrı testte sabitlenir; mevcut metinler aynı kalmalı
    expect(text(sec.replace(FORM_RE, ''))).toBe(expected);
  });
  it('NS4-18 oyun sonu gönderim formu: yalnızca görevin istediği metinler', () => {
    const form = FORM_RE.exec(over)?.[0] ?? '';
    expect(text(form)).toBe('Takma ad Global tabloya gönder 3–16 karakter: harf, rakam, boşluk, - _ .');
    // ana eylemlerden (Tekrar oyna / Ana menü) sonra gelir: hiyerarşi değişmez
    expect(at(over, 'id="b-menu"')).toBeLessThan(at(over, 'id="submit-score"'));
    expect(at(over, 'id="submit-score"')).toBeLessThan(at(over, 'id="tip-over"'));
  });
  it('Ayarlar: yalnızca görevdeki üç grup başlığı eklendi', () => {
    // grup başlıkları (legend) çıkarılınca metin a67fe7f ile aynı
    expect(text(set.replace(/<legend>[^<]+<\/legend>/g, ''))).toBe(
      'Ayarlar Ses efektleri Ortam müziği Titreşim Destekleyen Android cihazlarda Hayalet parça DAS Basılı tutunca kayma gecikmesi: ms ARR Kayma tekrar hızı: ms FPS göstergesi Performans testi için Kaydet',
    );
    expect([...set.matchAll(/<legend>([^<]+)<\/legend>/g)].map((m) => m[1])).toEqual([
      'Ses',
      'Oynanış',
      'İleri ayarlar',
    ]);
  });
});

describe('Mola', () => {
  it('Devam et başlığın hemen altında ana eylem; Ayarlar / Ana menü ve rehber ikincil', () => {
    expect(at(pause, '<h2>Mola</h2>')).toBeLessThan(at(pause, 'id="b-resume"'));
    expect(pause).toMatch(/<button class="btn primary" id="b-resume">Devam et<\/button>/);
    expect(pause).toMatch(/<button class="btn ghost" id="b-set2">Ayarlar<\/button>/);
    expect(pause).toMatch(/<button class="btn ghost" id="b-quit">Ana menü<\/button>/);
    expect(pause).toMatch(/<a class="btn link" id="cta-pause" target="_blank" rel="noopener"/);
    // Tab sırası: Devam et → Ayarlar → Ana menü → rehber (ipucu odak almaz)
    const order = ['b-resume', 'b-set2', 'b-quit', 'tip-pause', 'cta-pause'].map((id) => at(pause, `id="${id}"`));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(rule('.sheet-pause #b-resume')).toMatch(/min-height: calc\(58px/);
  });
  it('oyunun üstünde koyu, bulanık arka plan (kart ile oyun görüntüsü karışmaz)', () => {
    for (const s of [pause, over, how, set]) expect(s).toMatch(/class="screen screen-dim"/);
    expect(rule('.screen.screen-dim')).toMatch(/var\(--color-board\) 58%/);
    expect(rule('.screen.screen-dim')).toMatch(/backdrop-filter: blur\(3px\)/);
  });
});

let dom: FakeDom;
describe('Mola odak ve Escape akışı (sahte DOM)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dom = installFakeDom();
  });
  async function load() {
    vi.resetModules();
    const { createLifecycle } = await import('../../src/app/lifecycle');
    const { InputController } = await import('../../src/input/InputController');
    const screens = await import('../../src/ui/screens');
    screens.bindBackButtons();
    const g = createGame(1);
    const lc = createLifecycle(createAppStubs(g).deps);
    new InputController({
      game: g,
      canvas: dom.canvas as unknown as HTMLCanvasElement,
      settings: { das: 167, arr: 33 },
      getState: lc.getState,
      getCell: () => 30,
      pause: lc.pause,
      resume: lc.resume,
      closeSub: screens.closeSub,
      unlockAudio: () => {},
    });
    const key = (k: string) => dom.window.dispatch('keydown', { key: k });
    const active = () => (dom.document.activeElement as { id?: string } | null)?.id;
    return { lc, screens, key, active };
  }
  it('Escape → Mola (odak Devam et) → Ayarlar → Escape Mola’ya döner → Escape oyuna döner', async () => {
    const { lc, screens, key, active } = await load();
    lc.start();
    vi.advanceTimersByTime(50);
    key('Escape');
    vi.advanceTimersByTime(50);
    expect(dom.visibleScreen()).toBe('scr-pause');
    expect(active()).toBe('b-resume');
    screens.openSub('scr-set');
    vi.advanceTimersByTime(50);
    key('Escape');
    vi.advanceTimersByTime(50);
    expect(dom.visibleScreen()).toBe('scr-pause');
    key('Escape');
    vi.advanceTimersByTime(50);
    expect(dom.visibleScreen()).toBeNull();
    expect(lc.getState()).toBe('playing');
    expect(active()).toBe('stage');
  });
});

describe('Ayarlar', () => {
  const groups = [...set.matchAll(/<fieldset class="([^"]+)">([\s\S]*?)<\/fieldset>/g)].map((m) => ({
    cls: m[1] ?? '',
    legend: /<legend>([^<]+)<\/legend>/.exec(m[2] ?? '')?.[1],
    keys: [...(m[2] ?? '').matchAll(/data-k="(\w+)"/g)].map((k) => k[1]),
  }));
  it('Ses / Oynanış / İleri ayarlar gruplarında aynı kayıt anahtarları', () => {
    expect(groups.map((g) => [g.legend, g.keys])).toEqual([
      ['Ses', ['sound', 'music']],
      ['Oynanış', ['haptics', 'ghost']],
      ['İleri ayarlar', ['das', 'arr', 'fps']],
    ]);
    expect(groups[2]?.cls).toContain('set-advanced');
  });
  it('kontroller yerel (klavyeyle kullanılabilir) giriş öğeleri ve etiket içinde; sınırlar değişmedi', () => {
    const inputs = [...set.matchAll(/<input\s([^>]+?)\s*\/?>/g)].map((m) => (m[1] ?? '').replace(/\s+/g, ' ').trim());
    // NS4-17: erişilebilir ad/açıklama bağları ve ilk odak (data-focus) eklendi; tür, anahtar ve sınırlar aynı
    expect(inputs).toEqual([
      'type="checkbox" data-k="sound" data-focus',
      'type="checkbox" data-k="music"',
      'type="checkbox" data-k="haptics" aria-labelledby="lbl-haptics" aria-describedby="hap-note"',
      'type="checkbox" data-k="ghost"',
      'type="range" min="50" max="300" step="1" data-k="das" aria-labelledby="lbl-das" aria-describedby="desc-das"',
      'type="range" min="0" max="100" step="1" data-k="arr" aria-labelledby="lbl-arr" aria-describedby="desc-arr"',
      'type="checkbox" data-k="fps" aria-labelledby="lbl-fps" aria-describedby="desc-fps"',
    ]);
    // her giriş kendi <label class="set …"> öğesinin içinde (etikete tıklama/odak)
    for (const m of set.matchAll(/<label class="set[^"]*"([\s\S]*?)<\/label>/g)) expect(m[1]).toMatch(/<input\s/);
    expect([...set.matchAll(/<label class="set/g)]).toHaveLength(7);
    expect(set).toMatch(/Basılı tutunca kayma gecikmesi: <b id="v-das"><\/b> ms/);
    expect(set).toMatch(/Kayma tekrar hızı: <b id="v-arr"><\/b> ms/);
    expect(set).toMatch(/<label class="set set-minor"[\s\S]*?data-k="fps"/); // FPS geri planda
    expect(plainCss).toMatch(/input:focus-visible \{\s*outline: 3px solid var\(--color-focus-ring\);/);
    expect(set).not.toMatch(/tema|theme/i);
  });
  it('ayarlar kalıcı (fn_settings, aynı alanlar)', async () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
    vi.resetModules();
    const a = await import('../../src/storage/settings');
    Object.assign(a.settings, {
      sound: false,
      music: false,
      haptics: false,
      ghost: false,
      fps: true,
      das: 120,
      arr: 0,
    });
    a.saveSettings();
    expect(JSON.parse(data.get('fn_settings') ?? '{}')).toEqual({
      sound: false,
      music: false,
      haptics: false,
      ghost: false,
      fps: true,
      das: 120,
      arr: 0,
    });
    vi.resetModules();
    const b = await import('../../src/storage/settings');
    expect(b.settings).toEqual({
      sound: false,
      music: false,
      haptics: false,
      ghost: false,
      fps: true,
      das: 120,
      arr: 0,
    });
  });
});

describe('Nasıl oynanır', () => {
  it('içerik gövdede kayar, Tamam (geri) ve Öğreticiyle oyna altta ayrı ağırlıkta', () => {
    // içerik klavyeyle de kaydırılır (odaklanabilir bölge, başlıkla adlandırılmış)
    expect(how).toMatch(
      /<div class="sheet sheet-wide sheet-scroll">\s*<div class="sheet-body" tabindex="0" role="region" aria-labelledby="how-title">\s*<h2 id="how-title">Nasıl oynanır<\/h2>/,
    );
    expect(rule('.sheet-body:focus-visible')).toMatch(/outline: 3px solid var\(--color-focus-ring\)/);
    expect(how).toMatch(
      /<div class="sheet-actions row2">\s*<button class="btn ghost" data-back>Tamam<\/button>\s*<button class="btn primary" id="b-tutorial">Öğreticiyle oyna<\/button>/,
    );
    expect(rule('.sheet.sheet-scroll')).toMatch(/overflow: hidden/);
    const body = rule('.sheet-body');
    expect(body).toMatch(/overflow-y: auto/);
    expect(body).toMatch(/min-height: 0/);
    expect(body).toMatch(/touch-action: pan-y/);
    expect(body).toMatch(/overscroll-behavior: contain/);
    expect(rule('.sheet-actions')).toMatch(/flex: none/);
  });
  it('kontrol çiftleri iki grup; geniş ekranda yan yana, tuşlar kbd', () => {
    expect([...how.matchAll(/<div class="ctl-group">\s*<h3>(\w+)<\/h3>/g)].map((m) => m[1])).toEqual([
      'Dokunmatik',
      'Klavye',
    ]);
    expect([...how.matchAll(/<dt>/g)]).toHaveLength(11);
    expect([...how.matchAll(/<kbd>/g)]).toHaveLength(13);
    expect(mediaBlock('@media (min-width: 760px)')).toMatch(/\.ctl-groups \{\s*grid-template-columns: 1fr 1fr;/);
  });
});

describe('Oyun sonu', () => {
  it('hiyerarşi: yeni rekor → skor/drenaj/rekor → rozetler → sağlık → Tekrar oyna → Ana menü', () => {
    const order = [
      'id="newbest"',
      'id="o-score"',
      'id="o-badges"',
      'class="health"',
      'id="cta-over"',
      'id="b-again"',
      'id="b-menu"',
    ].map((n) => at(over, n));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(over).toMatch(/<button class="btn primary" id="b-again">Tekrar oyna<\/button>/);
    expect(over).toMatch(/<button class="btn ghost" id="b-menu">Ana menü<\/button>/);
    expect(rule('.over-actions #b-again')).toMatch(/min-height: calc\(56px/);
    // odak hâlâ kartın kendisinde (NS4-10)
    expect(over).toMatch(/<div class="sheet sheet-over" tabindex="-1" data-focus/);
  });
  it('sağlık CTA’sı görünür ama sakin: dolu reklam bandı değil, ana eylemden hafif', () => {
    const cta = rule('.health .btn.cta');
    expect(cta).toMatch(/background: var\(--color-btn-bg\)/);
    expect(cta).toMatch(/color: var\(--color-fresh-strong\)/);
    expect(cta).toMatch(/min-height: 46px/);
    expect(over).toMatch(
      /<a class="btn cta" id="cta-over" target="_blank" rel="noopener"\s*>Rahat nefes rehberini aç</,
    );
  });
  it('kısa yatay ekranda iki sütun (Tekrar oyna kaydırmadan görünür)', () => {
    expect(mediaBlock('@media (orientation: landscape) and (max-height: 520px)')).toMatch(
      /\.sheet\.sheet-over \{[^}]*grid-template-columns: 1fr 1fr;/,
    );
  });
});

describe('CTA URL ve UTM değerleri değişmedi', () => {
  it.each([
    [
      'game_over',
      'https://www.yasasinsaglik.com/?utm_source=ferah_nefes_oyun&utm_medium=advergame&utm_campaign=sinus_bulmaca&utm_content=game_over',
    ],
    [
      'pause_menu',
      'https://www.yasasinsaglik.com/?utm_source=ferah_nefes_oyun&utm_medium=advergame&utm_campaign=sinus_bulmaca&utm_content=pause_menu',
    ],
  ] as const)('%s', (placement, url) => {
    expect(CFG.cta).toBe('https://www.yasasinsaglik.com/');
    expect(ctaUrl(placement)).toBe(url);
  });
  it('bağlantılar bootstrap’ta aynı yerleşimlerle atanır', () => {
    const b = sources['../../src/app/bootstrap.ts'] ?? '';
    expect(b).toContain("$('cta-over', HTMLAnchorElement).href = ctaUrl('game_over');");
    expect(b).toContain("$('cta-pause', HTMLAnchorElement).href = ctaUrl('pause_menu');");
  });
});

describe('rozet durumları', () => {
  it('yeni / kazanılmış / kilitli', () => {
    expect(badgeState('ozmotik', ['ozmotik'], ['ozmotik'])).toBe('new');
    expect(badgeState('ozmotik', ['ozmotik'], [])).toBe('earned');
    expect(badgeState('noro', ['ozmotik'], [])).toBe('locked');
  });
  it('oyun sonu listesi sırası korunur, her rozet durum sınıfı ve data-state taşır', async () => {
    vi.useFakeTimers();
    dom = installFakeDom();
    vi.resetModules();
    const { renderBadges } = await import('../../src/ui/badges');
    const bx = dom.el('o-badges');
    renderBadges(bx as unknown as HTMLElement, ['ozmotik', 'akis'], ['akis']);
    const kids = bx.children.map((c) => [c.children[0]?.textContent, c.className, c.dataset['state']]);
    expect(kids).toEqual([
      ['Ozmotik usta', 'earned', 'earned'],
      ['Nörorefleks uzmanı', 'locked', 'locked'],
      ['Akış hali', 'new', 'new'],
      ['Çok yaşa!', 'locked', 'locked'],
      ['Derin nefes', 'locked', 'locked'],
    ]);
    expect(BADGE_IDS).toHaveLength(5);
  });
  it('kilitli rozet kesik kenarlı ve soluk; kazanılan dolu ve onay işaretli; yeni ayrıca vurgulu', () => {
    expect(rule('.badges > span.locked')).toMatch(/outline: 1.5px dashed var\(--color-border-strong\)/);
    expect(rule('.badges > span.locked')).toMatch(/color: var\(--color-text-muted\)/);
    expect(rule('.badges > span')).toMatch(/background: var\(--color-cyclamen-soft\)/);
    expect(rule('.badges > span::before')).toMatch(/url\("data:image\/svg\+xml/);
    expect(rule('.badges > span.locked::before')).toMatch(/background: transparent/);
    expect(rule('.badges > span.new')).toMatch(/background: var\(--color-cyclamen\)/);
  });
});

describe('tipografi', () => {
  it('ortak ölçek tokenları :root’ta; kartlar ve HUD bunları kullanır', () => {
    const root = rule(':root');
    for (const t of [
      '--fs-title: 28px',
      '--fs-body: 15px',
      '--fs-ui: 14px',
      '--fs-caption: 12px',
      '--fs-hud-score: 32px',
      '--ui-scale: 1',
      '--hud-scale: 1',
    ])
      expect(root).toContain(t);
    expect(rule('.sheet h2')).toMatch(/font-size: calc\(var\(--fs-title\) \* var\(--ui-scale\)\)/);
    expect(rule('#stats .score')).toMatch(/font-size: calc\(var\(--fs-hud-score\) \* var\(--hud-scale\)\)/);
    expect(rule('.lbl')).toMatch(/var\(--hud-scale\)/);
    expect(plainCss).not.toMatch(/font-family: (?!var\()/); // font ailesi yalnızca tokenlardan (fps hariç: font kısa yazımı)
  });
  it('büyük ekran HUD ölçeği kontrollü; mobil ve 1366×768 aynı', () => {
    const s = ([w, h]: readonly [number, number]) => hudScale(computeLayout(w, h));
    expect(s([390, 844])).toBe(1);
    expect(s([844, 390])).toBe(1);
    expect(s([768, 1024])).toBe(1);
    expect(s([1366, 768])).toBe(1);
    expect(s([1600, 900])).toBeGreaterThan(1.05);
    expect(s([1920, 1080])).toBeCloseTo(1.3, 5);
    expect(s([2560, 1440])).toBe(HUD_SCALE_MAX);
    const sizes = [
      [1366, 768],
      [1600, 900],
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
    ] as const;
    const vals = sizes.map(s);
    expect([...vals].sort((a, b) => a - b)).toEqual(vals); // monoton
    expect(Math.max(...vals)).toBeLessThanOrEqual(1.4);
  });
  it('yardımcı kartlar büyük ekranda büyür; başlangıç ekranı (kapsam dışı) ölçeklenmez', () => {
    for (const [q, v] of [
      ['@media (min-width: 1500px) and (min-height: 860px)', '1.12'],
      ['@media (min-width: 1880px) and (min-height: 1020px)', '1.25'],
      ['@media (min-width: 2400px) and (min-height: 1340px)', '1.45'],
    ] as const) {
      const b = mediaBlock(q);
      expect(b).toContain(`--ui-scale: ${v}`);
      expect(b).not.toContain('scr-start');
    }
  });
  it('mobilde taşma yok: kart genişliği ekranla sınırlı, yükseklik ekran içinde kayar', () => {
    expect(rule('.sheet')).toMatch(/width: min\(calc\(420px \* var\(--ui-scale\)\), 100%\)/);
    expect(rule('.sheet')).toMatch(/max-height: 100%/);
    expect(rule('.sheet')).toMatch(/overflow-y: auto/);
  });
});
