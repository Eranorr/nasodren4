// Sinüzit Atağı barı ve Spray düğmesi: yerleşim çakışmaz ve ekrana sığar, HUD durumları (dolum, uyarı, hazır, hedefsiz),
// erişilebilirlik ve CSS (hareketi azalt), kayıt kuralları (tek oyunculu kaydedilir, çok oyunculu kaydedilmez).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../src/game/Game';
import { PIECE } from '../../src/game/pieces';
import { ORIGIN, SINUS } from '../../src/game/sinusAttack';
import { computeLayout, versusLayout } from '../../src/rendering/layout';
import type { Layout, Rect } from '../../src/types/layout';
import { createAppStubs } from '../helpers/appStubs';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { mediaBlock, rule } from '../helpers/css';
import html from '../../index.html?raw';

const VIEWPORTS = [
  [390, 844],
  [844, 390],
  [1366, 768],
  [1920, 1080],
] as const;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const hudRects = (L: Layout): [string, Rect][] => [
  ['board', L.board],
  ['hold', L.hold],
  ['next', L.next],
  ['stats', L.stats],
  ['cong', L.cong],
  ['btnHold', L.btnHold],
  ['btnCyc', L.btnCyc],
  ['btnSneeze', L.btnSneeze],
  ['btnPause', L.btnPause],
];
const disabled = (dom: FakeDom) => (dom.el('btn-spray') as unknown as { disabled: boolean }).disabled;

describe('yerleşim', () => {
  it.each(VIEWPORTS)('%ix%i: atak barı ve Spray HUD panellerine, butonlara ve tahtaya binmez; ekrana sığar', (W, H) => {
    for (const versus of [false, true]) {
      const L = versus ? versusLayout(W, H).L : computeLayout(W, H);
      const opps = versus ? versusLayout(W, H).opps : null;
      const bar = L.attackBar,
        spray = L.btnSpray;
      for (const [name, r] of hudRects(L)) {
        expect(overlap(bar, r), `${W}x${H} bar×${name} (versus ${versus})`).toBe(false);
        expect(overlap(spray, r), `${W}x${H} spray×${name} (versus ${versus})`).toBe(false);
      }
      expect(overlap(bar, spray)).toBe(false);
      if (opps) {
        expect(overlap(bar, opps), `${W}x${H} bar×rakip`).toBe(false);
        expect(overlap(spray, opps), `${W}x${H} spray×rakip`).toBe(false);
      }
      for (const r of [bar, spray]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(W);
        expect(r.y + r.h).toBeLessThanOrEqual(H);
      }
      // bar tahtanın yanında: portrede altında (yatay), yatayda sağında (dikey)
      if (L.portrait) expect([bar.w > bar.h, bar.y >= L.board.y + L.board.h]).toEqual([true, true]);
      else expect([bar.h > bar.w, bar.x >= L.board.x + L.board.w]).toEqual([true, true]);
    }
  });
});

describe('HUD', () => {
  let dom: FakeDom;
  beforeEach(() => {
    vi.useFakeTimers();
    dom = installFakeDom();
    vi.resetModules();
  });
  it('bar dolar ve uyarı verir; Spray şarjı dolar; hazırken etkin; dolu ama hedefsizken kapalı ve çizgili', async () => {
    const { createSinusHud, ATTACK_WARN, ATTACK_HIT_MS } = await import('../../src/ui/sinusHud');
    const g = new Game();
    g.reset({ seed: 1 });
    const hud = createSinusHud();
    hud.layout(computeLayout(390, 844));
    g.attackT = SINUS.attackMs * 0.5;
    hud.sync(g, true);
    expect(dom.el('attack-fill').style['transform']).toBe('scaleX(0.5)');
    expect(dom.el('attack-bar').getAttribute('aria-valuenow')).toBe('50');
    expect(dom.el('attack-bar').classList.contains('warn')).toBe(false);
    g.attackT = SINUS.attackMs * ATTACK_WARN;
    hud.sync(g, true);
    expect(dom.el('attack-bar').classList.contains('warn')).toBe(true);
    hud.sync(g, false); // oyun dışı: uyarı yok
    expect(dom.el('attack-bar').classList.contains('warn')).toBe(false);
    expect(disabled(dom)).toBe(true);
    g.sprayCharge = SINUS.sprayThreshold / 2;
    hud.sync(g, true);
    expect(dom.el('spray-fill').style['transform']).toBe('scaleX(0.5)');
    // dolu, atak grisi yok: kapalı ve hedefsiz görünüm
    g.sprayCharge = SINUS.sprayThreshold;
    hud.sync(g, true);
    expect([disabled(dom), dom.el('btn-spray').classList.contains('idle')]).toEqual([true, true]);
    // atak grisi gelince hazır
    g.board[21 * 10 + 4] = PIECE.GARBAGE;
    g.origin[21 * 10 + 4] = ORIGIN.attack;
    hud.sync(g, true);
    expect([
      disabled(dom),
      dom.el('btn-spray').classList.contains('ready'),
      dom.el('btn-spray').classList.contains('idle'),
    ]).toEqual([false, true, false]);
    hud.onAttack();
    expect(dom.el('attack-bar').classList.contains('hit')).toBe(true);
    vi.advanceTimersByTime(ATTACK_HIT_MS);
    expect(dom.el('attack-bar').classList.contains('hit')).toBe(false);
  });
  it('yatay düzende bar dikey dolar', async () => {
    const { createSinusHud } = await import('../../src/ui/sinusHud');
    const g = new Game();
    g.reset({ seed: 1 });
    const hud = createSinusHud();
    hud.layout(computeLayout(1366, 768));
    g.attackT = SINUS.attackMs * 0.25;
    hud.sync(g, true);
    expect(dom.el('attack-fill').style['transform']).toBe('scaleY(0.25)');
    expect(dom.el('attack-bar').classList.contains('v')).toBe(true);
  });
  it('erişilebilirlik: Spray düğmesi adlı ve gizli değil; bar "Sinüzit Atağı" ilerleme çubuğu; yeni görünür metin yok', () => {
    const spray = /<button id="btn-spray"[^>]*>/.exec(html)?.[0] ?? '';
    expect(spray).toContain('aria-label="Spray"');
    expect(spray).not.toContain('hidden');
    const bar = /<div\s+id="attack-bar"[^>]*>/.exec(html)?.[0] ?? '';
    expect(bar).toMatch(/role="progressbar"/);
    expect(bar).toMatch(/aria-label="Sinüzit Atağı"/);
    expect(bar).not.toMatch(/hidden/);
    // görünür metin: yalnızca düğme adı
    const btn = html.slice(
      html.indexOf('<button id="btn-spray"'),
      html.indexOf('</button>', html.indexOf('btn-spray')),
    );
    expect(
      btn
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    ).toBe('Spray');
  });
  it('CSS: uyarı nabzı hareketi azalt tercihinde kapalı; odak halkası düğmelerde', () => {
    expect(rule('#attack-bar.warn i')).toMatch(/animation:\s*attackWarn/);
    expect(mediaBlock('@media (prefers-reduced-motion: reduce)')).toMatch(
      /#attack-bar\.warn i,[^{}]*\{\s*animation:\s*none/,
    );
    expect(rule('#btn-spray.idle .charge i')).toMatch(/repeating-linear-gradient/);
  });
});

describe('kayıt: tek oyunculu kaydedilir, çok oyunculu tur kaydedilmez', () => {
  let data: Map<string, string>;
  beforeEach(() => {
    vi.useFakeTimers();
    installFakeDom();
    data = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
    vi.resetModules();
  });
  it('tek oyunculu: yerel skor ve kişisel rekor yeni kural setiyle yazılır', async () => {
    const { createLifecycle } = await import('../../src/app/lifecycle');
    const g = new Game();
    const onGameRecorded = vi.fn();
    const lc = createLifecycle({ ...createAppStubs(g, true).deps, onGameRecorded });
    lc.start();
    g.score = 50;
    lc.handleGameOver('blockout');
    vi.advanceTimersByTime(1000);
    expect(onGameRecorded).toHaveBeenCalled();
    expect(onGameRecorded.mock.calls[0]?.[0]).toMatchObject({ ruleset: 'sinus-attack-spray-v1' });
    expect(JSON.parse(data.get('fn_meta') ?? '{}')).toMatchObject({ best: 50 });
  });
  it('çok oyunculu tur: yerel skor, kişisel rekor ve gönderim yok', async () => {
    const { createLifecycle } = await import('../../src/app/lifecycle');
    const g = new Game();
    const onGameRecorded = vi.fn();
    const onOver = vi.fn();
    const lc = createLifecycle({
      ...createAppStubs(g, true).deps,
      onGameRecorded,
      versus: { onOver, onPause: () => {} },
    });
    lc.start({ seed: 5 });
    g.score = 9999;
    lc.handleGameOver('blockout');
    vi.advanceTimersByTime(1000);
    expect(onOver).toHaveBeenCalled();
    expect(onGameRecorded).not.toHaveBeenCalled();
    expect(data.get('fn_scores')).toBeUndefined();
    expect((JSON.parse(data.get('fn_meta') ?? '{}') as { best?: number }).best ?? 0).toBe(0);
  });
});
