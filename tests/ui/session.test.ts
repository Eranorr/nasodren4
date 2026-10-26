import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { dropVerticalI, finishClear, setupWell, stackRows } from '../helpers/gameHelpers';
import { loadUi } from '../helpers/uiHarness';

let dom: FakeDom;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
});

/** ×2, hapşırık (şarj), vinyet, toast ve popup aynı anda görünür hâle getirilir. NS4-24: Rebound kaldırıldı. */
async function busySession() {
  const ui = await loadUi();
  const { g, lc, frame } = ui;
  lc.start();
  stackRows(g, 7);
  frame(); // sıklamen hazır toast'u
  g.useCyc();
  finishClear(g);
  stackRows(g, 7);
  g.useSneeze();
  finishClear(g);
  stackRows(g, 14); // tıkanıklık 0.70
  frame();
  expect(dom.el('badge-mult').style['display']).toBe('block');
  expect(dom.el('btn-sneeze').dataset['state']).toBe('charging');
  expect(dom.el('danger').classList.contains('on')).toBe(true);
  expect(dom.el('toast').classList.contains('show')).toBe(true);
  expect(dom.el('popups').childElementCount).toBeGreaterThan(0);
  return ui;
}

function transientUi() {
  return {
    mult: dom.el('badge-mult').style['display'],
    fill: dom.el('sneeze-fill').style['transform'],
    danger: dom.el('danger').classList.contains('on'),
    toast: dom.el('toast').classList.contains('show'),
    popups: dom.el('popups').childElementCount,
  };
}
const CLEAN = { mult: 'none', fill: 'scaleX(1)', danger: false, toast: false, popups: 0 };

describe('pause → ana menü', () => {
  it('×2, hapşırık şarjı, vinyet, toast ve popup temizlenir', async () => {
    const { lc } = await busySession();
    lc.pause();
    lc.toMenu();
    expect(lc.getState()).toBe('menu');
    expect(dom.visibleScreen()).toBe('scr-start');
    expect(transientUi()).toEqual(CLEAN);
    // güçlendirici butonları menünün arkasında eski oturumun durumunu göstermez
    expect([dom.el('btn-cyc').dataset['state'], dom.el('btn-sneeze').dataset['state']]).toEqual(['locked', 'locked']);
    expect([dom.el('btn-cyc').disabled, dom.el('btn-sneeze').disabled]).toEqual([true, true]);
    expect(dom.el('sneeze-sub').textContent).toBe('Tıkanıklık %35’te açılır');
  });

  it('menüde süren oyun zamanlayıcıları görsel durum üretmez', async () => {
    const { g, lc, frame } = await busySession();
    lc.pause();
    lc.toMenu();
    expect(g.multT).toBeGreaterThan(0); // oyun nesnesindeki süreler durur, ama görünmez
    expect(g.sneezeCharge()).toBeLessThan(1);
    for (let i = 0; i < 10; i++) frame();
    vi.advanceTimersByTime(10000); // toast/popup zamanlayıcıları
    expect(transientUi()).toEqual(CLEAN);
  });

  it('yeni oyun temiz HUD ile başlar', async () => {
    const { lc, frame } = await busySession();
    lc.pause();
    lc.toMenu();
    lc.start();
    frame();
    expect(transientUi()).toEqual(CLEAN);
    expect(dom.el('hud-score').textContent).toBe('0');
    expect(dom.el('cyc-sub').textContent).toBe('Tıkanıklık %35’te açılır');
    expect(dom.el('sneeze-sub').textContent).toBe('Tıkanıklık %35’te açılır');
    expect(dom.el('btn-cyc').dataset['state']).toBe('locked');
    expect(dom.el('btn-sneeze').dataset['state']).toBe('locked');
  });

  it('game-over sonrası “Tekrar oyna” da temiz başlar', async () => {
    const { g, lc, frame } = await busySession();
    g.gameOver('lockout');
    frame();
    lc.start();
    frame();
    expect(transientUi()).toEqual(CLEAN);
  });
});

describe('yarım bırakılan oyun', () => {
  it('ana menüye çıkışta skor kaydedilmez (mevcut davranış)', async () => {
    const data = new Map<string, string>();
    const setItem = vi.fn((k: string, v: string) => {
      data.set(k, v);
    });
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem });
    const { g, lc, frame } = await loadUi();
    const { meta } = await import('../../src/storage/progress');
    lc.start();
    setupWell(g, 4);
    dropVerticalI(g);
    finishClear(g);
    frame();
    expect(g.score).toBeGreaterThan(0);
    lc.pause();
    lc.toMenu();
    // Oyun içinde kazanılan rozet (Tetris → ozmotik) anında kaydedilir (mevcut davranış); skor ve satır kaydedilmez.
    const saved: unknown = JSON.parse(data.get('fn_meta') ?? 'null');
    expect(saved).toEqual({ best: 0, totalLines: 0, badges: ['ozmotik'] });
    expect(meta.best).toBe(0);
    expect(meta.totalLines).toBe(0);
  });
});
