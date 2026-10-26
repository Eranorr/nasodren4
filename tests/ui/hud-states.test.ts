// NS4-10: güçlendirici durumu dar ekranlarda da metinle anlaşılır (kısa durum etiketi + erişilebilir ad).
import { CFG } from '../../src/config/gameConfig';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { finishClear, stackRows } from '../helpers/gameHelpers';
import { mediaBlock, rule } from '../helpers/css';
import { loadUi } from '../helpers/uiHarness';

let dom: FakeDom;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
});

const read = (id: 'btn-cyc' | 'btn-sneeze') => {
  const b = dom.el(id);
  return {
    state: b.dataset['state'],
    chip: dom.el(id === 'btn-cyc' ? 'cyc-chip' : 'sneeze-chip').textContent,
    label: b.getAttribute('aria-label'),
  };
};

describe('kısa durum etiketi ve erişilebilir ad', () => {
  it('sıklamen: Kilitli → Hazır → Kullanıldı → ×2 etkin', async () => {
    const { g, lc, frame } = await loadUi();
    lc.start();
    frame();
    expect(read('btn-cyc')).toEqual({
      state: 'locked',
      chip: 'Kilitli',
      label: 'Sıklamen özütü: Tıkanıklık %35’te açılır',
    });
    stackRows(g, 7);
    frame();
    expect(read('btn-cyc')).toEqual({ state: 'ready', chip: 'Hazır', label: 'Sıklamen özütü: Hazır · oyunda 1 kez' });
    g.useCyc();
    frame();
    expect(read('btn-cyc')).toEqual({
      state: 'used',
      chip: 'Kullanıldı',
      label: 'Sıklamen özütü: Bu oyunda kullanıldı',
    });
    finishClear(g);
    frame();
    expect(read('btn-cyc')).toEqual({
      state: 'active',
      chip: '×2 etkin',
      label: 'Sıklamen özütü: Kullanıldı · ×2 etkin',
    });
  });

  it('hapşırık: Kilitli → Hazır → Doluyor (yüzdeyle) → Hazır', async () => {
    const { g, lc, frame } = await loadUi();
    lc.start();
    frame();
    expect(read('btn-sneeze')).toEqual({
      state: 'locked',
      chip: 'Kilitli',
      label: 'Hapşırık: Tıkanıklık %35’te açılır',
    });
    stackRows(g, 7);
    frame();
    expect(read('btn-sneeze')).toEqual({ state: 'ready', chip: 'Hazır', label: 'Hapşırık: Hazır · üstü savurur' });
    g.useSneeze();
    finishClear(g);
    frame();
    expect(read('btn-sneeze')).toEqual({ state: 'charging', chip: 'Doluyor', label: 'Hapşırık: Burun kaşınıyor… %0' });
    expect(dom.el('sneeze-fill').style['transform']).toBe('scaleX(0)');
    g.sneezePieces = CFG.sneezePieces / 2;
    frame();
    expect(read('btn-sneeze').label).toBe('Hapşırık: Burun kaşınıyor… %50');
    expect(dom.el('sneeze-fill').style['transform']).toBe('scaleX(0.5)');
    g.sneezePieces = CFG.sneezePieces;
    stackRows(g, 7);
    frame();
    expect(read('btn-sneeze').state).toBe('ready');
    expect(dom.el('sneeze-fill').style['transform']).toBe('scaleX(1)');
  });

  it('ana menüye dönüşte etiketler başlangıç durumuna döner', async () => {
    const { g, lc, frame } = await loadUi();
    lc.start();
    stackRows(g, 7);
    frame();
    lc.pause();
    lc.toMenu();
    expect(read('btn-cyc')).toEqual({
      state: 'locked',
      chip: 'Kilitli',
      label: 'Sıklamen özütü: Tıkanıklık %35’te açılır',
    });
    expect(read('btn-sneeze').chip).toBe('Kilitli');
  });
});

describe('işaretleme ve stiller', () => {
  it('güçlendirici butonlarında kısa durum etiketi elemanı var', () => {
    expect(html).toMatch(/<span class="chip" id="cyc-chip" aria-hidden="true">Kilitli<\/span>/);
    expect(html).toMatch(/<span class="chip" id="sneeze-chip" aria-hidden="true">Kilitli<\/span>/);
    expect(html).toMatch(/<span class="charge" aria-hidden="true"><i id="sneeze-fill"><\/i><\/span>/);
  });

  it('kısa etiket yalnızca dar (compact) düzende görünür; geniş düzende uzun alt metin kalır', () => {
    expect(rule('.gbtn .chip')).toMatch(/display:\s*none/);
    expect(rule('.compact-btn .chip')).toMatch(/display:\s*block/);
    expect(rule('.compact-btn .t small')).toMatch(/display:\s*none/);
  });

  it('durum etiketleri renge ek olarak kenar çizgisiyle de ayrılır', () => {
    for (const s of ['ready', 'used', 'active', 'charging'])
      expect(rule(`.gbtn[data-state='${s}'] .chip`), s).toMatch(/box-shadow:\s*inset 0 0 0 1px/);
  });

  it('×2 rozeti tahtanın genişliğini aşmaz (satır kırılır)', () => {
    expect(rule('#fx-badges')).toMatch(/flex-direction:\s*column/);
    expect(rule('#fx-badges .badge')).toMatch(/white-space:\s*normal/);
    expect(rule('#fx-badges .badge')).toMatch(/max-width:\s*100%/);
  });

  it('reduced motion bloğu korunuyor', () => {
    expect(mediaBlock('@media (prefers-reduced-motion: reduce)')).toMatch(/\.gbtn\.ready/);
  });
});
