// Çok oyunculu tur: tohumlu oyun (herkes aynı parçaları ve oda dizilimini alır), tahta kodlama, yerleşim ve
// lifecycle'ın tur davranışı (yerel liste/rekor etkilenmez, final ekranı açılmaz, mola "ara verdi" bildirir).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLS, HIDDEN, VIS } from '../../src/config/gameConfig';
import { Game, seeded } from '../../src/game/Game';
import { encodeBoard } from '../../src/multiplayer/versus';
import { MP_SIDE, MP_STRIP, computeLayout, versusLayout } from '../../src/rendering/layout';
import type { StartOptions } from '../../src/app/lifecycle';
import { createAppStubs } from '../helpers/appStubs';
import { installFakeDom } from '../helpers/fakeDom';

const snapshot = (g: Game) => ({
  queue: [g.type, ...g.queue],
  cores: [g.core, ...g.queueCore],
  board: [...g.board].join(''),
});

describe('tohumlu oyun', () => {
  it('seeded: aynı tohum aynı dizi, farklı tohum farklı; [0, 1) aralığında', () => {
    const a = seeded(42),
      b = seeded(42),
      c = seeded(43);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 50 }, () => c())).not.toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
  it('aynı tohumla iki cihaz: aynı parça sırası, çekirdekler ve oda dizilimi (Math.random kullanılmaz)', () => {
    const spy = vi.spyOn(Math, 'random');
    const g1 = new Game(),
      g2 = new Game();
    g1.reset({ rooms: true, seed: 777 });
    spy.mockClear();
    g2.reset({ rooms: true, seed: 777 });
    expect(snapshot(g2)).toEqual(snapshot(g1));
    for (let i = 0; i < 30; i++) {
      g1.hardDrop();
      g2.hardDrop();
      g1.update(5000);
      g2.update(5000);
    }
    expect(snapshot(g2)).toEqual(snapshot(g1));
    expect(spy).not.toHaveBeenCalled();
    g1.reset({ rooms: true, seed: 778 });
    expect(snapshot(g1)).not.toEqual(snapshot(g2));
  });
  it('tohumsuz oyun Math.random kullanır (tek oyunculu davranış aynı)', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    new Game().reset({ rooms: true });
    expect(spy).toHaveBeenCalled();
  });
});

describe('tahta kodlama', () => {
  it('görünür tahta + düşen parça; VIS×COLS hücre, 0..8', () => {
    const g = new Game();
    g.reset({ seed: 1 });
    g.board[(HIDDEN + VIS - 1) * COLS] = 8;
    const b = encodeBoard(g);
    expect(b).toMatch(new RegExp(`^[0-8]{${VIS * COLS}}$`));
    expect(b[(VIS - 1) * COLS]).toBe('8');
    // düşen parça görünür satırlara inince kodlanır
    g.hardDrop();
    const after = encodeBoard(g);
    expect([...after].filter((c) => c !== '0' && c !== '8').length).toBeGreaterThanOrEqual(4);
  });
});

describe('tur yerleşimi', () => {
  it.each([
    [390, 844],
    [1366, 768],
    [844, 390],
    [1920, 1080],
  ])('%ix%i: rakip alanı tahtaya, HUD panellerine ve butonlara binmez', (W, H) => {
    const { L, opps } = versusLayout(W, H);
    expect([L.W, L.H]).toEqual([W, H]);
    const rects = [L.board, L.hold, L.next, L.stats, L.btnHold, L.btnCyc, L.btnSneeze, L.btnPause];
    const overlap = (a: typeof opps, b: typeof opps) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const r of rects) expect(overlap(opps, r), JSON.stringify(r)).toBe(false);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h).toBeLessThanOrEqual(H);
    }
    if (computeLayout(W, H).portrait) expect(opps.h).toBe(MP_STRIP - 12);
    else expect(opps.w).toBe(MP_SIDE - 12);
  });
});

describe('lifecycle: çok oyunculu tur', () => {
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
  async function setup() {
    const { createLifecycle } = await import('../../src/app/lifecycle');
    const g = new Game();
    const onOver = vi.fn(),
      onPause = vi.fn(),
      onGameRecorded = vi.fn();
    const stubs = createAppStubs(g, true);
    const lc = createLifecycle({ ...stubs.deps, onGameRecorded, versus: { onOver, onPause } });
    return { g, lc, onOver, onPause, onGameRecorded, stubs };
  }
  it('tohumla başlar; oyun sonu yerel listeye/rekora yazılmaz, sonuç tur ekranına gider', async () => {
    const { g, lc, onOver, onGameRecorded } = await setup();
    lc.start({ seed: 99 });
    expect(lc.isVersus()).toBe(true);
    const ref = new Game();
    ref.reset({ rooms: true, seed: 99 });
    expect([g.type, ...g.queue]).toEqual([ref.type, ...ref.queue]);
    g.score = 5000;
    lc.handleGameOver('blockout');
    expect(onOver).toHaveBeenCalledWith({ score: 5000, lines: 0, level: 1 });
    vi.advanceTimersByTime(2000);
    expect(onGameRecorded).not.toHaveBeenCalled();
    expect(data.get('fn_scores')).toBeUndefined();
    const meta = JSON.parse(data.get('fn_meta') ?? '{"best":0}') as { best?: number };
    expect(meta.best).toBe(0);
    expect(lc.getState()).toBe('over');
  });
  it('mola "ara verdi" bildirir; final ekranı açılmaz (serbest nefese geçilir); tur bitince oyun kapanır', async () => {
    const { lc, onPause } = await setup();
    lc.start({ seed: 1 });
    lc.pause();
    expect(onPause).toHaveBeenLastCalledWith(true);
    lc.resume();
    expect(onPause).toHaveBeenLastCalledWith(false);
    lc.showFinal();
    expect(lc.getState()).toBe('playing');
    lc.pause();
    lc.endVersus();
    expect([lc.getState(), lc.isVersus()]).toEqual(['over', false]);
  });
  it('tek oyunculu oyun etkilenmez: tıklama olayı tohum sayılmaz', async () => {
    const { lc, onPause } = await setup();
    const click: unknown = { type: 'click' };
    lc.start(click as StartOptions);
    expect(lc.isVersus()).toBe(false);
    lc.pause();
    expect(onPause).not.toHaveBeenCalled();
  });
});
