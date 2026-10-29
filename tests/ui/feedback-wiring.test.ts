// NS4-15: oyun olayları → GameView efekt çağrıları ve hareket tercihi. Gerçek lifecycle + wireGameEvents,
// View/ses taklit (çağrılar kaydedilir). Durum mesajları (popup) reduced motion'dan bağımsızdır.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CFG } from '../../src/config/gameConfig';
import { REDUCED_MOTION_QUERY, watchReducedMotion } from '../../src/app/motion';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { dropVerticalI, finishClear, setupWell, stackRows } from '../helpers/gameHelpers';
import { loadUi } from '../helpers/uiHarness';

let dom: FakeDom;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
});
const viewCalls = (calls: readonly string[]) => calls.filter((c) => c.startsWith('view.'));
const popups = () => dom.el('popups').children.map((p) => p.children.map((s) => s.textContent));

describe('efekt bağlantıları', () => {
  it('scored, clearstart’tan önce view.onScored’a gider (Ozmotik/Nörorefleks dili seçilir)', async () => {
    const { g, lc, calls } = await loadUi();
    lc.start();
    calls.length = 0;
    setupWell(g, 4);
    dropVerticalI(g);
    const v = viewCalls(calls);
    expect(v.indexOf('view.onScored')).toBeGreaterThanOrEqual(0);
    expect(v.indexOf('view.onScored')).toBeLessThan(v.indexOf('view.onClearStart'));
    expect(popups()).toContainEqual(['TETRİS', 'Dört satır birden!']);
  });

  it('hapşırık: clearstart görünüme gider; popup "HAPŞUU! / Çok yaşa!"; rebound/garbage bağlantısı yok', async () => {
    const { g, lc, calls } = await loadUi();
    lc.start();
    stackRows(g, 7);
    calls.length = 0;
    expect(g.useSneeze()).toBe(true);
    expect(calls).toContain('view.onClearStart');
    expect(popups()).toContainEqual(['HAPŞUU!', 'Çok yaşa!']);
    finishClear(g);
    expect(calls).toContain('view.onClearEnd');
    expect(calls.filter((c) => /onRebound|onGarbage/.test(c))).toEqual([]);
  });

  // NS4-16: NS4-15'te izinsiz eklenen "Puan ×2 · 30 sn · sıklamen tek kullanımlık" popup'ı kaldırıldı.
  // ×2 başlangıcı onaylı rozet/sayaç ve görsel vuruşla (GameView.cycBoost) anlaşılır.
  it('sıklamen: onaylı başlangıç popup’ı kalır, bitişte yeni metin yok; ×2 rozeti ve sayacı çalışır', async () => {
    const { g, lc, frame, calls } = await loadUi();
    lc.start();
    stackRows(g, 8);
    expect(g.useCyc()).toBe(true);
    expect(popups()).toEqual([['Sıklamen özütü', 'Alt satırlar temizleniyor']]);
    calls.length = 0;
    finishClear(g);
    expect(popups()).toEqual([['Sıklamen özütü', 'Alt satırlar temizleniyor']]); // bitişte popup eklenmez
    expect(JSON.stringify(popups())).not.toMatch(/Puan ×2|tek kullanımlık/);
    expect(calls).toContain('view.onClearEnd'); // görsel ×2 vuruşu GameView'de
    expect(g.multT).toBe(CFG.cycMultMs);
    frame();
    const badge = dom.el('badge-mult');
    expect(badge.style['display']).toBe('block');
    expect(badge.textContent).toBe(`Ferah nefes ×2 · ${CFG.cycMultMs / 1000} sn`);
    g.update(10_000);
    frame();
    expect(badge.textContent).toBe(`Ferah nefes ×2 · ${CFG.cycMultMs / 1000 - 10} sn`);
    g.update(CFG.cycMultMs);
    frame();
    expect(badge.style['display']).toBe('none');
  });

  it('yeni oyun view.resetFx ile süren efektleri temizler', async () => {
    const { lc, calls } = await loadUi();
    lc.start();
    expect(calls.indexOf('view.resetFx')).toBeLessThan(calls.indexOf('view.syncAll'));
  });
});

describe('hareket tercihi (prefers-reduced-motion)', () => {
  function fakeMedia(initial: boolean) {
    let listener: ((e: { matches: boolean }) => void) | null = null;
    const queries: string[] = [];
    const win = {
      matchMedia: (q: string) => {
        queries.push(q);
        return {
          matches: initial,
          addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
            listener = fn;
          },
        } as unknown as MediaQueryList;
      },
    };
    return { win, queries, change: (m: boolean) => listener?.({ matches: m }) };
  }

  it('başlangıç değeri ve canlı değişiklik uygulanır; yalnızca hareket sorgusu kullanılır', () => {
    const m = fakeMedia(true);
    const seen: boolean[] = [];
    watchReducedMotion((r) => seen.push(r), m.win);
    m.change(false);
    m.change(true);
    expect(seen).toEqual([true, false, true]);
    expect(m.queries).toEqual([REDUCED_MOTION_QUERY]);
    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
  });

  it('matchMedia yoksa tam hareket', () => {
    const seen: boolean[] = [];
    watchReducedMotion((r) => seen.push(r), {});
    expect(seen).toEqual([false]);
  });
});
