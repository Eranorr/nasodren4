// NS4-12: öğretici gerçek lifecycle, InputController (klavye + dokunmatik), DOM kartı ve kayıtla birlikte.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import { isTutorialRecordDone } from '../../src/storage/tutorial';
import { STEP_COPY } from '../../src/tutorial/steps';
import { createAppStubs } from '../helpers/appStubs';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { createGame } from '../helpers/gameHelpers';

let dom: FakeDom;
let data: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
  data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
});

async function load(mode: 'keyboard' | 'touch' = 'keyboard') {
  vi.resetModules();
  const { createLifecycle } = await import('../../src/app/lifecycle');
  const { InputController } = await import('../../src/input/InputController');
  const { Tutorial } = await import('../../src/tutorial/Tutorial');
  const { createTutorialView } = await import('../../src/ui/tutorialView');
  const { tutorialStore } = await import('../../src/storage/tutorial');
  const screens = await import('../../src/ui/screens');
  screens.initScreens();
  const g = createGame(1);
  const tutorialView = createTutorialView({ skip: () => tutorial.skip(), done: () => tutorial.acknowledge() });
  const tutorial = new Tutorial(g, tutorialView, tutorialStore, { mode });
  const lc = createLifecycle({ ...createAppStubs(g).deps, tutorial });
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
    onSoftDrop: () => tutorial.softDrop(),
    onInputMode: (m) => tutorial.setMode(m),
  });
  const key = (k: string) => dom.window.dispatch('keydown', { key: k });
  const card = () => ({
    hidden: dom.el('tutorial').hidden,
    step: dom.el('tut-step').textContent,
    title: dom.el('tut-title').textContent,
    text: dom.el('tut-text').textContent,
    done: !dom.el('tut-done').hidden,
  });
  return { g, lc, tutorial, key, card };
}

describe('klavye akışı (DOM kartı ile)', () => {
  it('ilk oyunda kart açılır, her tuş doğru adımı ilerletir, tamamlanınca kaydedilir', async () => {
    const { g, lc, key, card } = await load();
    lc.start();
    expect(card()).toEqual({
      hidden: false,
      step: 'Öğretici · 1/6',
      title: 'Kaydır',
      text: STEP_COPY.move.keyboard,
      done: false,
    });
    key('ArrowRight');
    expect(card().title).toBe('Döndür');
    key('ArrowUp');
    expect(card().title).toBe('Yavaş indir');
    key('ArrowDown');
    expect(card().title).toBe('Anında bırak');
    key(' ');
    expect(card().title).toBe('Beklet');
    key('c');
    expect(card()).toMatchObject({ step: 'Öğretici · 6/6', title: 'Drenaj', done: true });
    dom.el('tut-done').click();
    expect(card().hidden).toBe(true);
    expect(data.get('fn_tutorial')).toBe('{"done":true}');
    expect(g.state).toBe('play'); // oyun olağan biçimde sürüyor
  });

  it('Atla butonu: kapanır, kaydedilir ve sonraki oyunda açılmaz', async () => {
    const { lc, card } = await load();
    lc.start();
    dom.el('tut-skip').click();
    expect(card().hidden).toBe(true);
    expect(data.get('fn_tutorial')).toBe('{"done":true}');
    lc.pause();
    lc.toMenu();
    lc.start();
    expect(card().hidden).toBe(true);
  });

  it('Escape ile pause: kart gizlenir; resume: aynı adım', async () => {
    const { lc, key, card } = await load();
    lc.start();
    key('ArrowLeft');
    key('Escape');
    expect(lc.getState()).toBe('paused');
    expect(card().hidden).toBe(true);
    key('Escape');
    expect(lc.getState()).toBe('playing');
    expect(card()).toMatchObject({ hidden: false, title: 'Döndür' });
  });

  it('ana menüye dönüş: tamamlanmış sayılmaz, yeni oyunda kaldığı adımdan sürer', async () => {
    const { lc, key, card } = await load();
    lc.start();
    key('ArrowLeft');
    key('Escape');
    lc.toMenu();
    expect(card().hidden).toBe(true);
    expect(data.has('fn_tutorial')).toBe(false);
    lc.start();
    expect(card()).toMatchObject({ hidden: false, title: 'Döndür' });
  });

  it('game-over: kart gizlenir; yeni oyunda yeniden görünür', async () => {
    const { g, lc, card } = await load();
    lc.start();
    g.on('gameover', (r) => lc.handleGameOver(r));
    g.gameOver('blockout');
    expect(card().hidden).toBe(true);
    lc.start();
    expect(card().hidden).toBe(false);
  });

  it('öğretici açıkken oyun kontrolleri engellenmez ve skor/yerçekimi değişmez', async () => {
    const { g, lc, key } = await load();
    lc.start();
    const x = g.x;
    key('ArrowRight');
    expect(g.x).toBe(x + 1);
    const y = g.y;
    g.update(1000); // seviye 1 yerçekimi: 1 sıra
    expect(g.y).toBe(y + 1);
    expect(g.score).toBe(0);
  });
});

describe('dokunmatik akış', () => {
  it('dokunmatik anlatım; klavye kullanılınca klavye anlatımına geçer, dokununca geri döner', async () => {
    const { lc, key, card } = await load('touch');
    lc.start();
    expect(card().text).toBe(STEP_COPY.move.touch);
    key('ArrowRight');
    expect(card()).toMatchObject({ title: 'Döndür', text: STEP_COPY.rotate.keyboard });
    dom.canvas.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    expect(card().text).toBe(STEP_COPY.rotate.touch);
  });

  it('aşağı sürükleme yavaş indirme adımını tamamlar', async () => {
    const { g, lc, tutorial, key } = await load('touch');
    lc.start();
    key('ArrowRight');
    g.rotate(1);
    expect(tutorial.step).toBe('soft');
    dom.canvas.dispatch('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 100 });
    dom.canvas.dispatch('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 160 });
    expect(tutorial.step).toBe('hard');
  });
});

describe('kayıt', () => {
  it.each<[string, unknown, boolean]>([
    ['geçerli', { done: true }, true],
    ['yok', null, false],
    ['false', { done: false }, false],
    ['metin', 'evet', false],
    ['dizi', [true], false],
    ['sayı', 1, false],
    ['done metin', { done: 'true' }, false],
  ])('%s kayıt → %s', (_n, raw, expected) => {
    expect(isTutorialRecordDone(raw)).toBe(expected);
  });

  it('JSON olarak okunamayan kayıt oyunu çökertmez; öğretici yeniden gösterilir', async () => {
    data.set('fn_tutorial', '{bozuk');
    const { lc, card } = await load();
    expect(() => lc.start()).not.toThrow();
    expect(card().hidden).toBe(false);
  });

  it('diğer kayıtlara dokunmaz (fn_meta / fn_settings ayrı)', async () => {
    data.set('fn_meta', '{"best":5,"totalLines":1,"badges":[]}');
    const { lc } = await load();
    lc.start();
    dom.el('tut-skip').click();
    expect(data.get('fn_meta')).toBe('{"best":5,"totalLines":1,"badges":[]}');
    expect([...data.keys()].sort()).toEqual(['fn_meta', 'fn_tutorial']);
  });
});

describe('işaretleme ve odak', () => {
  it('kart #stage içinde, Duraklat’tan sonra (Tab: Beklet › … › Duraklat › Atla); kart odak çalmaz', async () => {
    const stageHtml = html.slice(html.indexOf('<div id="stage"'), html.indexOf('<div id="danger"'));
    const order = [...stageHtml.matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['btn-hold', 'btn-cyc', 'btn-sneeze', 'btn-pause', 'tut-skip', 'tut-done']);
    expect(html).toMatch(/<div id="tutorial" class="tutorial" hidden>/);
    expect(html).toMatch(/class="tut-live" aria-live="polite"/);
    const { lc } = await load();
    lc.start();
    vi.advanceTimersByTime(50);
    expect((dom.document.activeElement as { id?: string } | null)?.id).toBe('stage');
  });

  it('“Nasıl oynanır”da yeniden başlatma butonu, Tamam’dan sonra', () => {
    const how = html.slice(
      html.indexOf('<section id="scr-how"'),
      html.indexOf('</section>', html.indexOf('<section id="scr-how"')),
    );
    expect(how.indexOf('data-back')).toBeLessThan(how.indexOf('id="b-tutorial"'));
    expect(how).toMatch(/id="b-tutorial">Öğreticiyle oyna</);
  });
});
