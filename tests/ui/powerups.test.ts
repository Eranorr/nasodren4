import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CFG } from '../../src/config/gameConfig';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import { finishClear, stackRows } from '../helpers/gameHelpers';
import { loadUi } from '../helpers/uiHarness';

let dom: FakeDom;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
});

function btn(id: 'btn-cyc' | 'btn-sneeze') {
  const b = dom.el(id);
  const sub = dom.el(id === 'btn-cyc' ? 'cyc-sub' : 'sneeze-sub');
  return {
    state: b.dataset['state'],
    text: sub.textContent,
    disabled: b.disabled,
    ready: b.classList.contains('ready'),
  };
}

describe('sıklamen butonu', () => {
  it('kilitli → hazır → kullanıldı → aktif etki → kullanıldı', async () => {
    const { g, lc, frame } = await loadUi();
    lc.start();
    frame();
    expect(btn('btn-cyc')).toEqual({ state: 'locked', text: 'Tıkanıklık %35’te açılır', disabled: true, ready: false });
    stackRows(g, 7); // %35
    frame();
    expect(btn('btn-cyc')).toEqual({ state: 'ready', text: 'Hazır · oyunda 1 kez', disabled: false, ready: true });
    g.useCyc();
    frame(); // drenaj sürerken
    expect(btn('btn-cyc')).toEqual({ state: 'used', text: 'Bu oyunda kullanıldı', disabled: true, ready: false });
    finishClear(g);
    frame();
    expect(btn('btn-cyc')).toEqual({ state: 'active', text: 'Kullanıldı · ×2 etkin', disabled: true, ready: false });
    expect(dom.el('badge-mult').style['display']).toBe('block');
    expect(dom.el('badge-mult').textContent).toBe('Ferah nefes ×2 · 30 sn');
    stackRows(g, 7); // tıkanıklık yeniden yüksek: tek kullanım, açılmaz
    frame();
    expect(btn('btn-cyc').state).toBe('active');
    expect(g.canCyc()).toBe(false);
  });

  it('×2 süresi bitince sayaç temizlenir ve buton "Bu oyunda kullanıldı" olur', async () => {
    const { g, lc, frame } = await loadUi();
    lc.start();
    stackRows(g, 7);
    g.useCyc();
    finishClear(g);
    frame();
    g.update(CFG.cycMultMs - 1000);
    frame();
    expect(dom.el('badge-mult').textContent).toBe('Ferah nefes ×2 · 1 sn');
    expect(btn('btn-cyc').state).toBe('active');
    g.update(1000);
    frame();
    expect(g.multT).toBe(0);
    expect(dom.el('badge-mult').style['display']).toBe('none');
    expect(btn('btn-cyc')).toMatchObject({ state: 'used', text: 'Bu oyunda kullanıldı', disabled: true });
  });
});

// NS4-24: sentetik açıcı ve rebound yerine hapşırık
describe('hapşırık butonu', () => {
  it('eşikte hazır; kullanınca doluyor (devre dışı), dolunca yeniden hazır ve haber verilir', async () => {
    const { g, lc, frame } = await loadUi();
    lc.start();
    frame();
    expect(btn('btn-sneeze')).toEqual({
      state: 'locked',
      text: 'Tıkanıklık %35’te açılır',
      disabled: true,
      ready: false,
    });
    stackRows(g, 7);
    frame();
    expect(btn('btn-sneeze')).toEqual({ state: 'ready', text: 'Hazır · üstü savurur', disabled: false, ready: true });
    g.useSneeze();
    finishClear(g);
    frame();
    expect(btn('btn-sneeze')).toEqual({ state: 'charging', text: 'Burun kaşınıyor…', disabled: true, ready: false });
    dom.el('toast').textContent = '';
    g.sneezePieces = CFG.sneezePieces;
    stackRows(g, 7);
    frame();
    expect(btn('btn-sneeze')).toEqual({ state: 'ready', text: 'Hazır · üstü savurur', disabled: false, ready: true });
    expect(dom.el('toast').textContent).toBe('Burnun yine kaşınıyor… Hapşırık hazır!');
  });

  it('ilk açılışta hapşırık toast’u sıklamen duyurusunu ezmez', async () => {
    const { g, lc, frame } = await loadUi();
    lc.start();
    stackRows(g, 7);
    frame();
    expect(dom.el('toast').textContent).toBe('Sinüslerin dolmaya başladı. Sıklamen özütü hazır.');
  });

  it('popup her hapşırıkta; 3. hapşırıkta "Çok yaşa!" rozeti; Rebound rozeti/uyarısı yok', async () => {
    const { g, lc } = await loadUi();
    lc.start();
    const popups = () => dom.el('popups').children.map((p) => p.children[0]?.textContent);
    for (let i = 0; i < 3; i++) {
      stackRows(g, 7);
      g.sneezePieces = CFG.sneezePieces;
      g.useSneeze();
      finishClear(g);
    }
    expect(popups().filter((t) => t === 'HAPŞUU!')).toHaveLength(3);
    expect(popups()).not.toContain('Rebound');
    expect(dom.el('toast').textContent).toMatch(/Rozet kazandın: Çok yaşa!/);
  });
});
