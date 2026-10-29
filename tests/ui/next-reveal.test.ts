// NS4-38: "Sıradaki" gizem kartı: yeni parça önce "?" kartıyla gelir, kart dönünce açılır; tık + çan sesi.
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { NextReveal, REVEAL, hideMsFor, revealFrame } from '../../src/ui/nextReveal';
import { createGame } from '../helpers/gameHelpers';

function setup(reduced = false) {
  const calls: string[] = [];
  const view = { visible: true, sx: 1, setNextReveal: (v: boolean, sx = 1) => ((view.visible = v), (view.sx = sx)) };
  const sound = {
    revealTick: (i: number) => calls.push(`tick${i}`),
    revealChime: (f: boolean) => calls.push(f ? 'chime-fast' : 'chime'),
  };
  const r = new NextReveal(view, sound, () => reduced);
  const g = { dealt: 1, state: 'play', level: 1 };
  /** `ms` boyunca 16 ms'lik karelerle oynatır. */
  const run = (ms: number, playing = true) => {
    for (let t = 0; t < ms; t += 16) r.update(g, 16, playing);
  };
  return { r, g, view, calls, run };
}

let dom: FakeDom;
beforeEach(() => {
  dom = installFakeDom();
});

describe('zaman çizelgesi', () => {
  it('kart kapalı → kart kapanır → parça taşarak açılır → biter', () => {
    const h = REVEAL.hideMs,
      f = REVEAL.flipMs;
    expect(revealFrame(0, h)).toEqual({ card: 1, piece: 0, done: false });
    expect(revealFrame(h + f / 4, h).card).toBeCloseTo(0.5);
    const mid = revealFrame(h + f * 0.75, h);
    expect(mid.card).toBe(0);
    expect(mid.piece).toBeGreaterThan(0.5);
    expect(revealFrame(h + f, h)).toEqual({ card: 0, piece: 1, done: true });
    const peak = Math.max(
      ...Array.from({ length: 50 }, (_, i) => revealFrame(h + f / 2 + (i / 50) * (f / 2), h).piece),
    );
    expect(peak).toBeGreaterThan(1); // hafif taşma
    expect(peak).toBeLessThan(1.15);
  });

  it('tıklar kart kapalıyken ve aralıkları uzayarak çalar', () => {
    const t = REVEAL.ticks;
    expect(t[t.length - 1]).toBeLessThan(REVEAL.hideMs);
    for (let i = 2; i < t.length; i++) expect(t[i] - t[i - 1]).toBeGreaterThan(t[i - 1] - t[i - 2]);
  });
});

describe('NextReveal', () => {
  it('yeni parça: önce "?" kartı (parça gizli), tıklar, çan, sonra parça görünür', () => {
    const { g, view, calls, run, r } = setup();
    run(2000); // ilk parçanın açılışı biter
    calls.length = 0;
    g.dealt = 2;
    run(16);
    expect(dom.el('next-mystery').classList.contains('on')).toBe(true);
    expect(view.visible).toBe(false);
    expect(r.hidden).toBe(true);
    run(REVEAL.hideMs);
    expect(calls).toEqual(['tick0', 'tick1', 'tick2', 'tick3', 'chime']);
    run(REVEAL.flipMs + 32);
    expect(view.visible).toBe(true);
    expect(view.sx).toBe(1);
    expect(dom.el('next-mystery').classList.contains('on')).toBe(false);
  });

  it('hızlı oyunda kısa sürüm: tık yok, kısık çan', () => {
    const { g, calls, run } = setup();
    g.dealt = 2;
    run(REVEAL.hideMs + REVEAL.flipMs + 32);
    calls.length = 0;
    g.dealt = 3; // önceki açılıştan < fastGapMs sonra
    run(REVEAL.fastHideMs + REVEAL.flipMs + 32);
    expect(calls).toEqual(['chime-fast']);
  });

  it('Beklet (sayaç değişmez) yeniden açılış başlatmaz; oda geçişinde geri dönen parça hemen görünür', () => {
    const { g, view, calls, run } = setup();
    run(2000);
    calls.length = 0;
    run(100); // aynı sayaç
    expect(calls).toEqual([]);
    g.state = 'clearing';
    g.dealt = 0; // beginRoomClear: parça kuyruğa döner
    run(16);
    expect(view.visible).toBe(true);
    expect(calls).toEqual([]);
  });

  it('oyun biterse açılış hemen tamamlanır', () => {
    const { g, view, run } = setup();
    run(2000);
    g.dealt = 5;
    run(16);
    expect(view.visible).toBe(false);
    run(16, false);
    expect(view.visible).toBe(true);
    expect(dom.el('next-mystery').classList.contains('on')).toBe(false);
  });

  it('hareketi azalt: kart söner, parça ölçeklenmeden belirir', () => {
    const { g, view, run } = setup(true);
    g.dealt = 2;
    run(REVEAL.hideMs + REVEAL.flipMs / 2 + 16);
    expect(view.visible).toBe(true);
    expect(view.sx).toBe(1);
  });
});

describe('NS4-39: bekleme seviyeyle kısalır', () => {
  it('1. seviyede tam süre, her seviyede kısalır, alt sınırda durur', () => {
    expect(hideMsFor(1)).toBe(REVEAL.hideMs);
    for (let l = 2; l <= 20; l++) expect(hideMsFor(l)).toBeLessThanOrEqual(hideMsFor(l - 1));
    expect(hideMsFor(2)).toBeLessThan(hideMsFor(1));
    expect(hideMsFor(20)).toBe(REVEAL.minHideMs);
    expect(REVEAL.minHideMs).toBeGreaterThan(REVEAL.fastHideMs);
  });

  it('yüksek seviyede kart daha erken açılır ve sığmayan tıklar çalmaz', () => {
    const { g, view, calls, run } = setup();
    run(2000);
    calls.length = 0;
    g.level = 12;
    g.dealt = 2;
    run(hideMsFor(12) + REVEAL.flipMs + 32);
    expect(view.visible).toBe(true);
    expect(calls).toEqual(['tick0', 'tick1', 'chime']); // 0, 70 ve 160 ms'ten önceki tıklar
  });
});

describe('Game.dealt', () => {
  it('her yeni parçada artar, Beklet ile değişmez, yeni oyunda sıfırlanmaz', () => {
    const g = createGame(1);
    const d0 = g.dealt;
    g.hardDrop();
    expect(g.dealt).toBe(d0 + 1);
    g.doHold(); // boş Beklet: kuyruktan parça çekilir
    expect(g.dealt).toBe(d0 + 2);
    g.hardDrop();
    g.doHold(); // dolu Beklet: takas, kuyruk değişmez
    expect(g.dealt).toBe(d0 + 3);
    g.reset();
    expect(g.dealt).toBe(d0 + 4);
  });
});
