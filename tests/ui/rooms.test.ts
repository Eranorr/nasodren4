// NS4-27: Sinüs Odaları arayüzü: oda/bulutçuk etiketleri, odaya özgü tahta tonu, oda popup'ları, ses/haptik/görsel
// bağlantıları ve oturum temizliği (gerçek lifecycle + olay bağlantıları, sahte DOM).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import { CFG, ROOMS } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import { ALL_CLEAR, FREE_NAME, ROOM_GOAL, roomLabel } from '../../src/content/rooms';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { mediaBlock, rule } from '../helpers/css';
import { clearBoard, dropVerticalI, fillRow, finishClear } from '../helpers/gameHelpers';
import { loadUi } from '../helpers/uiHarness';

let dom: FakeDom;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
});

const popups = () => dom.el('popups').children.map((p) => p.children.map((s) => s.textContent));
const hudState = () => ({
  shown: dom.el('room-hud').style['display'],
  name: dom.el('room-name').textContent,
  gray: dom.el('room-gray-n').textContent,
  grayShown: dom.el('room-gray').style['display'],
  tone: dom.el('board-bg').dataset['room'],
});

async function playRooms() {
  const ui = await loadUi(1, true);
  ui.lc.start();
  ui.frame();
  return ui;
}
/** Odanın son gri satırını tamamlar (oda açılır). */
function clearRoom(g: Awaited<ReturnType<typeof loadUi>>['g']) {
  clearBoard(g);
  fillRow(g, 21, PIECE.GARBAGE, [9]);
  dropVerticalI(g);
  finishClear(g);
}

describe('oda etiketleri ve tahta tonu', () => {
  it('1. odada: "1/4 · Yanak", kalan bulutçuk sayısı, varsayılan ton; açılış popup’ı', async () => {
    const { g } = await playRooms();
    expect(hudState()).toEqual({
      shown: 'flex',
      name: '1/4 · Yanak',
      gray: String(g.roomGray),
      grayShown: '',
      tone: '0',
    });
    expect(dom.el('room-name').getAttribute('aria-label')).toBe('Oda: Yanak sinüsü');
    expect(popups()).toContainEqual(['1. oda · Yanak sinüsü', ROOM_GOAL]);
  });

  it('kalan bulutçuk sayısı temizledikçe azalır', async () => {
    const { g, frame } = await playRooms();
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [9]);
    fillRow(g, 20, PIECE.GARBAGE, [0, 9]);
    dropVerticalI(g);
    finishClear(g);
    frame();
    expect(dom.el('room-gray-n').textContent).toBe('8');
  });

  it('oda açılınca: "Sinüs açıldı!" + bonus, kutlama görseli, ses ve titreşim; sonra 2. oda etiketi ve tonu', async () => {
    const { g, frame, calls } = await playRooms();
    calls.length = 0;
    clearRoom(g);
    expect(popups()).toContainEqual([
      'Sinüs açıldı!',
      `Yanak sinüsü ferahladı · +${CFG.roomBonus.toLocaleString('tr-TR')}`,
    ]);
    expect(calls).toEqual(expect.arrayContaining(['view.onRoomClear', 'sound.roomClear', 'buzz']));
    finishClear(g);
    frame();
    expect(hudState()).toMatchObject({ name: roomLabel(1), tone: '1' });
    expect(popups()).toContainEqual(['2. oda · Gözler arası sinüs', ROOM_GOAL]);
  });

  it('son odadan sonra Serbest nefes: kalan sayısı gizli, sinüs pembesi tonu', async () => {
    const { g, frame } = await playRooms();
    g.enterRoom(ROOMS.length - 1);
    clearRoom(g);
    finishClear(g);
    frame();
    expect(hudState()).toMatchObject({ name: FREE_NAME, grayShown: 'none', tone: String(ROOMS.length) });
    expect(popups().map((p) => p[0])).toContain(ALL_CLEAR);
  });

  it('ana menüde ve oda akışı kapalıyken etiketler gizli, ton yok', async () => {
    const { lc } = await playRooms();
    lc.pause();
    lc.toMenu();
    expect([hudState().shown, hudState().tone]).toEqual(['none', '']);
    const off = await loadUi(1, false);
    off.lc.start();
    off.frame();
    expect(dom.el('room-hud').style['display']).toBe('none');
  });
});

describe('işaretleme ve stil', () => {
  it('etiketler tahtanın üst kenarında, dokunmayı engellemez; uzun ad kısalır', () => {
    expect(html).toMatch(/<div id="room-hud" class="abs">/);
    expect(rule('#room-hud')).toContain('pointer-events: none');
    expect(rule('.room-pill')).toMatch(/text-overflow: ellipsis/);
    expect(rule('.room-pill')).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it('her odanın kendi tonu (1..4) yalnızca derinlik ve duvar değişkenlerini değiştirir', () => {
    for (let i = 1; i <= ROOMS.length; i++) {
      const r = rule(`#board-bg[data-room='${i}']`);
      expect(r).toContain('--color-board-light');
      expect(r).toContain('--color-rim');
      expect(r).not.toMatch(/background|--color-board:|--color-board-grid/);
    }
  });
  it('reduced motion bloğu korunuyor', () => {
    expect(mediaBlock('@media (prefers-reduced-motion: reduce)')).not.toBe('');
  });
});
