// NS4-22: büyük açılma anı arayüzü: Tetris / Tam Ferahlık / oda açılışında görsel + ses + ekran ışığı bağlantıları,
// Tam Ferahlık popup'ı, titreşim ve analitik; odada Tam Ferahlık'ın oda açılışıyla birleşmesi; stil ve işaretleme.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import { CFG } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import { FULL_RELIEF, FULL_RELIEF_SUB } from '../../src/content/relief';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { mediaBlock, plainCss, rule } from '../helpers/css';
import { clearBoard, dropVerticalI, fillRow, finishClear, setCell, setupWell } from '../helpers/gameHelpers';
import { loadUi } from '../helpers/uiHarness';
import { RELIEF_MS } from '../../src/ui/hud';

let dom: FakeDom;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
});

const popups = () => dom.el('popups').children.map((p) => p.children.map((s) => s.textContent));
const light = () => {
  const el = dom.el('relief');
  return el.classList.contains('on') ? el.dataset['kind'] : null;
};
const reliefCalls = (calls: string[]) => calls.filter((c) => /relief|roomClear|onRoomClear/.test(c));

describe('bağlantılar', () => {
  it('Tetris: temizleme başlarken görsel + ses + ekran ışığı; ışık süresi sonunda söner', async () => {
    const { g, lc, calls } = await loadUi();
    lc.start();
    setupWell(g, 4);
    setCell(g, 0, 17, PIECE.Z); // tahta boşalmasın
    calls.length = 0;
    dropVerticalI(g);
    expect(reliefCalls(calls)).toEqual(['view.relief', 'sound.relief']);
    expect(calls.indexOf('view.onClearStart')).toBeLessThan(calls.indexOf('view.relief'));
    expect(light()).toBe('tetris');
    vi.advanceTimersByTime(RELIEF_MS.tetris);
    expect(light()).toBeNull();
  });

  it('tekli/ikili/üçlü drenajda büyük an yok', async () => {
    const { g, lc, calls } = await loadUi();
    lc.start();
    setupWell(g, 2);
    calls.length = 0;
    dropVerticalI(g);
    expect(reliefCalls(calls)).toEqual([]);
    expect(light()).toBeNull();
  });

  it('Tam Ferahlık: popup (bonus), en güçlü an (analitik: tests/analytics/events.test.ts)', async () => {
    const { g, lc, calls } = await loadUi();
    lc.start();
    setupWell(g, 4);
    calls.length = 0;
    dropVerticalI(g);
    const bonus = CFG.allClearBonus[4];
    expect(popups()).toContainEqual([FULL_RELIEF, `${FULL_RELIEF_SUB} · +${bonus.toLocaleString('tr-TR')}`]);
    expect(reliefCalls(calls)).toEqual(['view.relief', 'sound.relief']);
    expect(light()).toBe('allclear');
    vi.advanceTimersByTime(RELIEF_MS.allclear - 1);
    expect(light()).toBe('allclear');
    vi.advanceTimersByTime(1);
    expect(light()).toBeNull();
  });

  it('oda açılışı: oda kutlaması + açılma anı (oda gücünde)', async () => {
    const { g, lc, calls } = await loadUi(1, true);
    lc.start();
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [9]);
    calls.length = 0;
    dropVerticalI(g); // I'nın üst üç hücresi kalır: Tam Ferahlık değil
    expect(reliefCalls(calls)).toEqual([]);
    finishClear(g);
    expect(reliefCalls(calls)).toEqual(['view.onRoomClear', 'view.relief', 'sound.roomClear']);
    expect(light()).toBe('room');
  });

  it('odada Tam Ferahlık: popup hemen, büyük an oda açılışında tek ve en güçlü hâliyle', async () => {
    const { g, lc, calls } = await loadUi(1, true);
    lc.start();
    setupWell(g, 4, PIECE.GARBAGE);
    calls.length = 0;
    dropVerticalI(g);
    expect(popups().map((p) => p[0])).toContain(FULL_RELIEF);
    expect(reliefCalls(calls)).toEqual([]); // satır temizlemesinde ayrıca oynamaz
    expect(light()).toBeNull();
    const buzzes = calls.filter((c) => c === 'buzz').length; // hard drop, satır, Tam Ferahlık
    finishClear(g); // → roomclear
    expect(reliefCalls(calls)).toEqual(['view.onRoomClear', 'view.relief', 'sound.roomClear']);
    expect(calls.filter((c) => c === 'buzz')).toHaveLength(buzzes); // oda deseni Tam Ferahlık'ın üstüne çalmaz
    expect(light()).toBe('allclear');
    // sonraki oda açılışı yine oda gücünde
    finishClear(g);
    vi.advanceTimersByTime(RELIEF_MS.allclear);
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [9]);
    dropVerticalI(g);
    finishClear(g);
    expect(light()).toBe('room');
  });

  it('ana menüye dönüşte ve yeni oyunda ışık söner', async () => {
    const { g, lc } = await loadUi();
    lc.start();
    setupWell(g, 4);
    dropVerticalI(g);
    expect(light()).toBe('allclear');
    lc.pause();
    lc.toMenu();
    expect(light()).toBeNull();
  });
});

describe('işaretleme ve stil', () => {
  it('ışık ekran okuyucudan gizli, basınç vinyetinden önce (kardeş seçicisi)', () => {
    expect(html).toMatch(/<div id="relief" aria-hidden="true"><\/div>\s*<!--[^>]*-->\s*<div id="pressure"/);
  });
  it('dokunmayı engellemez; renkler token; ışık sürerken basınç ve tehlike vinyeti kalkar', () => {
    const r = rule('#relief');
    expect(r).toContain('pointer-events: none');
    for (const sel of ['#relief', "#relief[data-kind='allclear']"]) {
      expect(rule(sel)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(rule(sel)).not.toMatch(/--color-(danger|pressure)/);
    }
    expect(rule("#relief[data-kind='allclear']")).toContain('--color-cyclamen-soft');
    expect(rule('#relief.on ~ #pressure, #relief.on ~ #danger')).toMatch(/opacity: 0 !important/);
  });
  it('animasyon süreleri hud.ts RELIEF_MS ile aynı', () => {
    expect(rule('#relief.on')).toContain(`${RELIEF_MS.tetris / 1000}s`);
    expect(rule("#relief.on[data-kind='room']")).toContain(`${RELIEF_MS.room / 1000}s`);
    expect(rule("#relief.on[data-kind='allclear']")).toContain(`${RELIEF_MS.allclear / 1000}s`);
    expect(plainCss).toMatch(/@keyframes relief \{/);
  });
  it('reduced motion: tek, yumuşak ve kısık ışık', () => {
    const m = mediaBlock('@media (prefers-reduced-motion: reduce)');
    expect(rule('#relief.on', m)).toContain('reliefSoft');
  });
});
