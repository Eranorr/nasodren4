// NS4-27: Sinüs Odaları arayüzü: oda etiketi, odaya özgü tahta tonu, oda popup'ları, ses/haptik/görsel bağlantıları ve
// oturum temizliği. NS4-30: açıklık çubuğu ve ilk bulutçuk ipucu. NS4-31: oda açılış kartı (sinüs haritası) ve final
// (gerçek lifecycle + olay bağlantıları, sahte DOM).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import { CFG, ROOMS } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import {
  ALL_CLEAR,
  CLOUD_HINT,
  FREE_GOAL,
  FREE_NAME,
  ROOM_CLEAR,
  ROOM_GOAL,
  ROOM_NEXT_FINAL,
  roomLabel,
} from '../../src/content/rooms';
import { OVER_TITLE } from '../../src/ui/screens';
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
  open: dom.el('room-open-n').textContent,
  openShown: dom.el('room-open').style['display'],
  tone: dom.el('board-bg').dataset['room'],
});
const card = () => ({
  on: dom.el('room-map').classList.contains('on'),
  sub: dom.el('rm-sub').textContent,
  next: dom.el('rm-next').textContent,
  map: { ...dom.el('rmap').dataset },
});

async function playRooms() {
  const ui = await loadUi(1, true);
  ui.lc.start();
  ui.frame();
  return ui;
}
type Ui = Awaited<ReturnType<typeof playRooms>>;
/** Odanın son gri satırını tamamlar (oda açılır; "Sinüs açıldı" geçişi başlar). */
function clearRoom(g: Ui['g']) {
  clearBoard(g);
  fillRow(g, 21, PIECE.GARBAGE, [9]);
  dropVerticalI(g);
  finishClear(g);
}
/** Son odayı açar ve geçişi bitirir: final ekranı. */
function reachFinal({ g }: Ui) {
  g.enterRoom(ROOMS.length - 1);
  clearRoom(g);
  finishClear(g);
}

describe('oda etiketleri ve tahta tonu', () => {
  it('1. odada: "1/4 · Yanak", "%0 açık", varsayılan ton; açılış popup’ı hedefi anlatır', async () => {
    await playRooms();
    expect(hudState()).toEqual({ shown: 'flex', name: '1/4 · Yanak', open: '%0', openShown: '', tone: '0' });
    expect(dom.el('room-name').getAttribute('aria-label')).toBe('Oda: Yanak sinüsü');
    expect(dom.el('room-open').getAttribute('aria-label')).toBe('Sinüs yüzde 0 açık');
    expect(dom.el('room-open-fill').style['transform']).toBe('scaleX(0)');
    expect(popups()).toContainEqual(['1. oda · Yanak sinüsü', ROOM_GOAL]);
  });

  it('NS4-30: açıklık temizledikçe artar (çubuk dolar); ilk bulutçuk ipucu oyun başına bir kez', async () => {
    const { g, frame } = await playRooms();
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [9]);
    fillRow(g, 20, PIECE.GARBAGE, [0, 9]);
    g.roomGray = g.roomGray0 = g.grayCount(); // 17
    dropVerticalI(g);
    expect(dom.el('toast').textContent).toBe(CLOUD_HINT);
    finishClear(g);
    frame();
    expect(hudState().open).toBe('%52'); // 9 / 17 (aşağı yuvarlanır)
    expect(dom.el('room-open-fill').style['transform']).toBe('scaleX(0.52)');
    dom.el('toast').textContent = '';
    fillRow(g, 21, PIECE.GARBAGE, [9]); // bir satır daha temizlenir: ipucu tekrar çıkmaz
    dropVerticalI(g);
    expect(dom.el('toast').textContent).toBe('');
  });

  it('NS4-31: oda açılınca harita kartı (açılan sinüs, sıradaki, bonus); sonraki odada kart kapanır', async () => {
    const { g, frame, calls } = await playRooms();
    calls.length = 0;
    clearRoom(g);
    expect(card()).toEqual({
      on: true,
      sub: `Yanak sinüsü ferahladı · +${CFG.roomBonus.toLocaleString('tr-TR')}`,
      next: 'Sıradaki: Gözler arası sinüs',
      map: { yanak: 'opening', etmoid: 'next', alin: 'closed', sfenoid: 'closed' },
    });
    expect(popups().map((p) => p[0])).not.toContain(ROOM_CLEAR); // eski popup kartın başlığı oldu
    expect(calls).toEqual(expect.arrayContaining(['view.onRoomClear', 'sound.roomClear', 'buzz']));
    finishClear(g);
    frame();
    expect(card().on).toBe(false);
    expect(hudState()).toMatchObject({ name: roomLabel(1), tone: '1', open: '%0' });
    expect(popups()).toContainEqual(['2. oda · Gözler arası sinüs', ROOM_GOAL]);
    clearRoom(g); // 2. oda: ilk sinüs açık kalır
    expect(card().map).toEqual({ yanak: 'open', etmoid: 'opening', alin: 'next', sfenoid: 'closed' });
  });

  it('NS4-42: oda açılınca tıkanıklık göstergesi animasyonla %0’a iner, geçiş boyunca kalır, yeni odada dolar', async () => {
    const { CONG_DRAIN_MS } = await import('../../src/ui/hud');
    const { g, frame } = await playRooms();
    const stack = () => {
      for (let r = 21; r >= 12; r--) fillRow(g, r, PIECE.T, [r % 10]); // ~%50 renkli yığın
    };
    stack();
    frame();
    expect(dom.el('cong-n').textContent).toBe('%50');
    clearRoom(g);
    stack(); // geçiş boyunca tahtada blok kalır (yeni odada silinir)
    const st = () => ({
      n: dom.el('cong-n').textContent,
      drain: dom.el('cong').classList.contains('drain'),
      meter: dom.el('meter').classList.contains('drain'),
      done: dom.el('cong').classList.contains('done'),
      state: dom.el('cong-state').textContent,
    });
    frame();
    expect(st()).toMatchObject({ drain: true, meter: true, done: false });
    vi.advanceTimersByTime(CONG_DRAIN_MS / 2);
    frame();
    const mid = Number(st().n.slice(1));
    expect(mid).toBeGreaterThan(5);
    expect(mid).toBeLessThan(45);
    vi.advanceTimersByTime(CONG_DRAIN_MS / 2 + 16);
    frame();
    expect(st()).toEqual({ n: '%0', drain: true, meter: true, done: true, state: 'Ferah' });
    expect(dom.el('danger').classList.contains('on')).toBe(false);
    vi.advanceTimersByTime(CFG.roomClearMs - CONG_DRAIN_MS); // harita kartı boyunca %0
    frame();
    expect(st().n).toBe('%0');
    finishClear(g); // 2. oda: yeni gri bulutçuklar
    vi.advanceTimersByTime(200);
    frame();
    expect(st()).toMatchObject({ drain: false, done: false });
    expect(dom.el('cong').classList.contains('refill')).toBe(true); // yeni değere yumuşak dolma
    expect(st().n).toBe(`%${Math.round(g.congestion() * 100)}`);
    expect(g.congestion()).toBeGreaterThan(0);
  });

  it('NS4-31: son oda: kartta "Sırada: final"; geçiş sonunda oyun durur, final ekranı (bütün sinüsler açık)', async () => {
    const ui = await playRooms();
    const { g, lc } = ui;
    g.enterRoom(ROOMS.length - 1);
    clearRoom(g);
    expect(card().next).toBe(ROOM_NEXT_FINAL);
    expect(card().map).toEqual({ yanak: 'open', etmoid: 'open', alin: 'open', sfenoid: 'opening' });
    finishClear(g);
    expect(lc.getState()).toBe('paused');
    expect(dom.visibleScreen()).toBe('scr-final');
    expect({ ...dom.el('fmap').dataset }).toEqual({ yanak: 'open', etmoid: 'open', alin: 'open', sfenoid: 'open' });
    expect(dom.el('f-score').textContent).toBe(g.score.toLocaleString('tr-TR'));
    expect(card().on).toBe(false);
  });

  it('NS4-31: final ekranını yalnızca seçim kapatır (pause/resume, sekme değişimi değiştirmez)', async () => {
    const ui = await playRooms();
    reachFinal(ui);
    ui.lc.pause();
    ui.lc.resume();
    expect([ui.lc.getState(), dom.visibleScreen()]).toEqual(['paused', 'scr-final']);
  });

  it('NS4-31: "Serbest nefese devam": oyun sürer, Serbest nefes popup’ı', async () => {
    const ui = await playRooms();
    reachFinal(ui);
    dom.el('popups').replaceChildren();
    ui.lc.continueFree();
    expect([ui.lc.getState(), dom.visibleScreen(), ui.g.state]).toEqual(['playing', null, 'play']);
    expect(popups()).toContainEqual([FREE_NAME, FREE_GOAL]);
    ui.frame(); // HUD yalnızca oynarken yazılır
    expect(hudState()).toMatchObject({ name: FREE_NAME, openShown: 'none', tone: String(ROOMS.length) });
  });

  it('NS4-31: "Bitir": oyun sonu "Bütün sinüsler açık!" (yenilgi sesi/griye dönme yok); yeni oyunda eski başlık', async () => {
    const ui = await playRooms();
    const { g, lc, calls } = ui;
    reachFinal(ui);
    calls.length = 0;
    lc.finish();
    expect([lc.getState(), g.state]).toEqual(['over', 'over']);
    expect(calls).not.toContain('view.onGameOver');
    expect(calls).not.toContain('sound.over');
    vi.advanceTimersByTime(1000);
    expect(dom.visibleScreen()).toBe('scr-over');
    expect(dom.el('o-title').textContent).toBe(ALL_CLEAR);
    lc.start();
    g.gameOver('lockout');
    vi.advanceTimersByTime(1000);
    expect(dom.el('o-title').textContent).toBe(OVER_TITLE);
  });

  it('ana menüde ve oda akışı kapalıyken etiketler gizli, ton yok, kart kapalı', async () => {
    const { g, lc } = await playRooms();
    clearRoom(g);
    lc.pause();
    lc.toMenu();
    expect([hudState().shown, hudState().tone, card().on]).toEqual(['none', '', false]);
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
  it('NS4-30: açıklık çubuğu turkuaz token, metnin arkasında; ekran okuyucu yüzdeyi okur, çubuğu değil', () => {
    expect(html).toMatch(/<i id="room-open-fill" class="room-open-fill" aria-hidden="true"><\/i\s*>/);
    expect(rule('.room-open-fill')).toContain('var(--color-fresh-soft)');
    expect(rule('.room-open-fill')).toContain('z-index: -1');
    expect(rule('.room-open')).toContain('isolation: isolate');
  });
  it('NS4-31: harita kartı dokunmayı engellemez, duyurulur; başlık ROOM_CLEAR; iki harita kopyasında dört sinüs', () => {
    expect(html).toMatch(/<div id="room-map" class="abs room-map" aria-live="polite">\s*<p class="rm-title">/);
    expect(html).toContain(`<p class="rm-title">${ROOM_CLEAR}</p>`);
    expect(rule('.room-map')).toContain('pointer-events: none');
    for (const id of ['rmap', 'fmap']) {
      const at = html.indexOf(`id="${id}"`);
      const svg = html.slice(at, html.indexOf('</svg>', at));
      expect(svg).toContain('aria-hidden="true"');
      for (const r of ROOMS) expect(svg, `${id} ${r.id}`).toContain(`s-${r.id}`);
    }
  });
  it('NS4-31: sinüs durumları token renkli; açık turkuaz, sıradaki sıklamen, kapalı basınç leylağı', () => {
    expect(rule('.sinus')).toContain('var(--color-pressure-soft)');
    const open = rule(
      "[data-yanak='open'] .s-yanak, [data-etmoid='open'] .s-etmoid, [data-alin='open'] .s-alin, [data-sfenoid='open'] .s-sfenoid",
    );
    expect(open).toContain('var(--color-fresh-soft)');
    const next = rule(
      "[data-yanak='next'] .s-yanak, [data-etmoid='next'] .s-etmoid, [data-alin='next'] .s-alin, [data-sfenoid='next'] .s-sfenoid",
    );
    expect(next).toContain('var(--color-cyclamen)');
    for (const sel of ['.room-map', '.sinus', '.sinus-svg .face']) expect(rule(sel)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it('reduced motion: kart kaymaz, sinüsler zıplamaz', () => {
    const m = mediaBlock('@media (prefers-reduced-motion: reduce)');
    expect(rule('.room-map, .room-map.on', m)).toContain('transition: none');
    expect(rule('.sinus-map .sinus', m)).toContain('animation: none');
  });
});
