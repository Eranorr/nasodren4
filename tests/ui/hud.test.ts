import html from '../../index.html?raw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStubs } from '../helpers/appStubs';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { createGame, finishClear, stackRows } from '../helpers/gameHelpers';

// Modül durumu (HUD önbelleği, ekran yığını) testler arasında taşınmasın diye her testte yeniden yüklenir.
async function load() {
  vi.resetModules();
  const { createLifecycle } = await import('../../src/app/lifecycle');
  const { updateHud } = await import('../../src/ui/hud');
  const g = createGame(1);
  const lc = createLifecycle(createAppStubs(g).deps);
  g.on('gameover', (r) => lc.handleGameOver(r));
  /** bootstrap'taki ana döngünün HUD adımı. */
  const frame = () => {
    const s = lc.getState();
    if (s === 'playing' || s === 'over') updateHud(g, s === 'playing');
  };
  return { g, lc, frame };
}

let dom: FakeDom;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
});

describe('tehlike vinyeti', () => {
  it('yüksek tıkanıklıkta açılır, pause sırasında gizlenir, resume sonrası yeniden açılır', async () => {
    const { g, lc, frame } = await load();
    lc.start();
    stackRows(g, 14); // tıkanıklık 0.70
    frame();
    expect(dom.el('danger').classList.contains('on')).toBe(true);
    lc.pause();
    frame(); // pause sırasında ana döngü HUD'u güncellemez
    expect(dom.el('danger').classList.contains('on')).toBe(false);
    lc.resume();
    frame();
    expect(dom.el('danger').classList.contains('on')).toBe(true);
  });

  it('resume sonrası mevcut tıkanıklığa göre hesaplanır (eşiğin altındaysa kapalı kalır)', async () => {
    const { g, lc, frame } = await load();
    lc.start();
    stackRows(g, 14);
    frame();
    lc.pause();
    stackRows(g, 6); // pause sırasında değişen tahta (ör. test kurulumu): 0.30
    lc.resume();
    frame();
    expect(dom.el('danger').classList.contains('on')).toBe(false);
  });

  it('oyun bitince kapanır', async () => {
    const { g, lc, frame } = await load();
    lc.start();
    stackRows(g, 14);
    frame();
    g.gameOver('blockout');
    frame();
    expect(dom.el('danger').classList.contains('on')).toBe(false);
  });
});

describe('efekt rozeti (×2)', () => {
  /** Sıklamen: ×2 sayacı çalışır. NS4-24: Rebound rozeti kaldırıldı. */
  function activateEffects(g: ReturnType<typeof createGame>) {
    stackRows(g, 7);
    g.useCyc();
    finishClear(g);
    expect(g.multT).toBeGreaterThan(0);
  }

  it('oynarken görünür, game-over sırasında gizlenir', async () => {
    const { g, lc, frame } = await load();
    lc.start();
    activateEffects(g);
    frame();
    expect(dom.el('badge-mult').style['display']).toBe('block');
    g.gameOver('lockout');
    expect(lc.getState()).toBe('over');
    frame();
    expect(dom.el('badge-mult').style['display']).toBe('none');
    frame(); // sonraki karelerde de gizli kalır
    expect(dom.el('badge-mult').style['display']).toBe('none');
  });

  it('yeni oyun temiz bir HUD ile başlar', async () => {
    const { g, lc, frame } = await load();
    lc.start();
    activateEffects(g);
    frame();
    g.gameOver('lockout');
    frame();
    lc.start();
    frame();
    expect(dom.el('badge-mult').style['display']).toBe('none');
    expect(dom.el('hud-score').textContent).toBe('0');
    expect(dom.el('danger').classList.contains('on')).toBe(false);
  });

  it('NS4-24: Rebound rozeti işaretlemeden kaldırıldı', () => {
    expect(html).not.toMatch(/badge-rebound|Rebound/);
  });
});

describe('NS4-38: skor ve tıkanıklık öne çıktı', () => {
  it('tıkanıklık kartı yüzdeyi, çubuğu ve durumu yazar', async () => {
    const { g, lc, frame } = await load();
    lc.start();
    frame();
    expect(dom.el('cong-n').textContent).toBe('%0');
    expect(dom.el('cong').dataset['state']).toBe('ferah');
    stackRows(g, 8); // 0.40
    frame();
    expect(dom.el('cong-n').textContent).toBe('%40');
    expect(dom.el('cong-fill').style['transform']).toBe('scaleX(0.4)');
    expect(dom.el('cong').dataset['state']).toBe('orta');
    expect(dom.el('cong-state').textContent).toBe('Artıyor');
    stackRows(g, 15); // 0.75
    frame();
    expect(dom.el('cong').dataset['state']).toBe('tikali');
    expect(dom.el('cong').getAttribute('aria-label')).toBe('Tıkanıklık yüzde 75, Tıkalı');
  });

  it('büyük kazanç sayarak artar ve "+N" gösterir; küçük kazanç hemen yazılır', async () => {
    const { SCORE_COUNT_MS } = await import('../../src/ui/hud');
    const { g, lc, frame } = await load();
    lc.start();
    frame();
    g.score += 20; // sert düşüş puanı gibi
    frame();
    expect(dom.el('hud-score').textContent).toBe('20');
    expect(dom.el('score-delta').classList.contains('on')).toBe(false);
    g.score += 1000;
    frame();
    expect(dom.el('score-delta').textContent).toBe('+1.000');
    expect(dom.el('score-delta').classList.contains('on')).toBe(true);
    expect(dom.el('hud-score').classList.contains('bump')).toBe(true);
    vi.advanceTimersByTime(SCORE_COUNT_MS / 3);
    frame();
    const mid = Number(dom.el('hud-score').textContent.replace('.', ''));
    expect(mid).toBeGreaterThan(20);
    expect(mid).toBeLessThan(1020);
    vi.advanceTimersByTime(SCORE_COUNT_MS);
    frame();
    expect(dom.el('hud-score').textContent).toBe('1.020');
  });
});
