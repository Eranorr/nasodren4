// NS4-20: tıkanıklık atmosferi: nefes halkası ritmi ve kademeli basınç vinyeti (sahte DOM + statik CSS).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import hudSrc from '../../src/ui/hud.ts?raw';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { stackRows } from '../helpers/gameHelpers';
import { mediaBlock, rule } from '../helpers/css';
import { loadUi } from '../helpers/uiHarness';
import { breathState, pressureLevel } from '../../src/ui/hud';

let dom: FakeDom;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
});

const read = () => ({ breath: dom.el('breath').dataset['state'], pressure: dom.el('pressure').style['opacity'] });

describe('eşikler', () => {
  it('nefes: %35 altı ferah, %35–70 orta, %70 ve üstü tıkalı', () => {
    expect(breathState(0)).toBe('ferah');
    expect(breathState(0.34)).toBe('ferah');
    expect(breathState(0.35)).toBe('orta');
    expect(breathState(0.69)).toBe('orta');
    expect(breathState(0.7)).toBe('tikali');
    expect(breathState(1)).toBe('tikali');
  });
  it('basınç %35 altında 0, tam tıkanıklıkta 1; 0,05 adımlı ve monoton', () => {
    expect(pressureLevel(0)).toBe(0);
    expect(pressureLevel(0.35)).toBe(0);
    expect(pressureLevel(1)).toBe(1);
    expect(pressureLevel(2)).toBe(1);
    let prev = 0;
    for (let c = 0; c <= 1; c += 0.01) {
      const p = pressureLevel(c);
      expect(Math.round(p * 20)).toBeCloseTo(p * 20, 9);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe('HUD', () => {
  it('tıkanıklık arttıkça nefes sığlaşır ve basınç artar', async () => {
    const { g, lc, frame } = await loadUi();
    lc.start();
    frame();
    expect(read()).toEqual({ breath: 'ferah', pressure: '0' });
    stackRows(g, 7); // 0,35
    frame();
    expect(read()).toEqual({ breath: 'orta', pressure: '0' });
    stackRows(g, 14); // 0,70
    frame();
    expect(read()).toEqual({ breath: 'tikali', pressure: String(pressureLevel(0.7)) });
  });

  it('oyun bitince ve ana menüde ferah, basınç yok; yeni oyun temiz başlar', async () => {
    const { g, lc, frame } = await loadUi();
    lc.start();
    stackRows(g, 16);
    frame();
    expect(read().breath).toBe('tikali');
    g.gameOver('lockout');
    frame();
    expect(read()).toEqual({ breath: 'ferah', pressure: '0' });
    lc.start();
    stackRows(g, 16);
    frame();
    lc.pause();
    lc.toMenu();
    expect(read()).toEqual({ breath: 'ferah', pressure: '0' });
  });
});

describe('işaretleme ve stil', () => {
  it('nefes halkası ekran okuyucudan gizli, görünür metin eklemez', () => {
    expect(html).toMatch(/<i id="breath" class="breath" data-state="ferah" aria-hidden="true"><\/i>Seviye/);
    expect(html).toMatch(/<div id="pressure" aria-hidden="true"><\/div>\s*<div id="danger">/);
  });
  it('basınç ve nefes renkleri token; tehlike kırmızısı kullanılmaz', () => {
    const p = rule('#pressure');
    expect(p).toContain('var(--color-pressure)');
    expect(p).not.toContain('danger');
    expect(p).toContain('pointer-events: none');
    expect(rule(".breath[data-state='tikali']")).toContain('var(--color-pressure)');
    expect(rule('.breath')).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it('hareketi azalt: nefes animasyonu ve basınç geçişi kapalı', () => {
    const m = mediaBlock('@media (prefers-reduced-motion: reduce)');
    expect(m).toMatch(/\.breath\s*\{\s*animation: none;/);
    expect(rule('#pressure', m)).toContain('transition: none');
  });
});

// NS4-21: sinüs boşluğu görünümü (zemin derinliği, yumuşak duvar, hava çıkışı)
describe('sinüs boşluğu', () => {
  it('tahta zemini: ızgara + derinlik katmanı; duvar ve hale tokenlarla', () => {
    const b = rule('#board-bg');
    expect(b).toMatch(/radial-gradient\(/);
    expect(b).toContain('var(--color-board-deep)');
    expect(b).toContain('var(--color-rim)');
    expect(b).toContain('var(--color-rim-glow)');
    expect(b).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it('hava çıkışı (ostium) dokunmayı engellemez', () => {
    const o = rule('#board-bg::after');
    expect(o).toContain('pointer-events: none');
    expect(o).toContain('var(--color-rim)');
  });
  it('ızgara hücre boyutunda (NS4-33: ::before katmanında, --cell), derinlik tahtayı kaplar', () => {
    expect(hudSrc).toContain("$('board-bg').style.setProperty('--cell', `${L.cell}px`);");
    expect(rule('#board-bg::before')).toContain('background-size: var(--cell) var(--cell)');
    expect(rule('#board-bg')).not.toContain('var(--color-board-grid)'); // ızgara artık duvarların üstünde
  });
});
