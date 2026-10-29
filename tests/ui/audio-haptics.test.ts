// NS4-17: oyun olayları → ses yöntemi ve haptik desen eşleşmesi (her olay bir kez), haptik açık/kapalı/desteksiz,
// reduced motion bağımsızlığı, lifecycle boyunca müzik (tek oturum, pause/resume stresi, yeni oyun, oyun sonu, menü),
// rozet ve ayar erişilebilirliği. Gerçek Game + lifecycle + wireGameEvents; View taklit, Sound gerçek veya kayıtçı.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import { CFG } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import { HAPTIC, createBuzz, detectVibrate, patternMs } from '../../src/haptics/haptics';
import type { Sound } from '../../src/audio/SoundManager';
import { GAME_OVER_MUSIC_DELAY } from '../../src/app/lifecycle';
import { createAppStubs } from '../helpers/appStubs';
import { installFakeAudio } from '../helpers/fakeAudio';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import {
  clearBoard,
  createGame,
  dropVerticalI,
  fillRow,
  finishClear,
  placePiece,
  setCell,
  setupWell,
  stackRows,
} from '../helpers/gameHelpers';

const sources = import.meta.glob<string>('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

let dom: FakeDom;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
});

/** Sound kayıtçısı: [yöntem, argümanlar]. */
function soundRecorder() {
  const log: [string, unknown[]][] = [];
  const s = new Proxy(
    {},
    {
      get: (_t, p) => (typeof p === 'symbol' ? undefined : (...a: unknown[]) => void log.push([String(p), a])),
    },
  ) as unknown as Sound;
  return {
    s,
    log,
    count: (m: string) => log.filter(([n]) => n === m).length,
    args: (m: string) => log.filter(([n]) => n === m).map(([, a]) => a),
  };
}

async function wire(seed = 1, sound?: Sound) {
  vi.resetModules();
  const { createLifecycle } = await import('../../src/app/lifecycle');
  const { wireGameEvents } = await import('../../src/app/events');
  const g = createGame(seed);
  const stubs = createAppStubs(g);
  const rec = soundRecorder();
  const buzz = vi.fn();
  const deps = { ...stubs.deps, sound: sound ?? rec.s, buzz };
  const lc = createLifecycle(deps);
  wireGameEvents({ ...deps, lifecycle: lc });
  return { g, lc, rec, buzz, deps };
}

describe('olay → ses ve haptik (her önemli olay bir kez)', () => {
  it('hard drop: hard sesi ve deseni; ardından gelen lock için oturma sesi/titreşimi çalınmaz', async () => {
    const { g, lc, rec, buzz } = await wire();
    lc.start();
    rec.log.length = 0;
    buzz.mockClear();
    setupWell(g, 1);
    dropVerticalI(g);
    expect([rec.count('hard'), rec.count('lock'), rec.count('clear')]).toEqual([1, 0, 1]);
    expect(rec.args('clear')).toEqual([[1, 0]]);
    expect(buzz.mock.calls).toEqual([[HAPTIC.hard], [HAPTIC.clear(1)]]);
  });
  it('yerçekimiyle oturma: lock sesi ve deseni bir kez; sonraki hard drop yine yalnızca hard', async () => {
    const { g, lc, rec, buzz } = await wire();
    lc.start();
    clearBoard(g);
    placePiece(g, PIECE.O, 0, 4, 20);
    rec.log.length = 0;
    buzz.mockClear();
    g.update(CFG.lockDelay + 20);
    expect([rec.count('lock'), rec.count('hard')]).toEqual([1, 0]);
    expect(buzz.mock.calls).toEqual([[HAPTIC.lock]]);
    rec.log.length = 0;
    buzz.mockClear();
    g.hardDrop();
    expect([rec.count('lock'), rec.count('hard')]).toEqual([0, 1]);
    expect(buzz.mock.calls).toEqual([[HAPTIC.hard]]);
  });
  it.each([2, 3, 4])('%i satır drenaj: clear(n, 0) ve satır sayısına göre desen', async (n) => {
    const { g, lc, rec, buzz } = await wire();
    lc.start();
    setupWell(g, n);
    setCell(g, 0, 21 - n, PIECE.Z); // NS4-22: tahta boşalmasın (Tam Ferahlık deseni ayrı testte)
    rec.log.length = 0;
    buzz.mockClear();
    dropVerticalI(g);
    expect(rec.args('clear')).toEqual([[n, 0]]);
    expect(buzz.mock.calls.at(-1)).toEqual([HAPTIC.clear(n)]);
  });
  it('T-spin double: clear(2, 2) bir kez', async () => {
    const { g, lc, rec } = await wire();
    lc.start();
    clearBoard(g);
    fillRow(g, 21, PIECE.L, [4]);
    fillRow(g, 20, PIECE.L, [3, 4, 5]);
    setCell(g, 3, 19, PIECE.L);
    placePiece(g, PIECE.T, 1, 3, 19);
    g.rotate(1);
    rec.log.length = 0;
    g.hardDrop();
    expect(rec.args('clear')).toEqual([[2, 2]]);
  });
  it('sıklamen: cyc sesi ve deseni bir kez; bitişte ek ses yok', async () => {
    const { g, lc, rec, buzz } = await wire();
    lc.start();
    stackRows(g, 8);
    rec.log.length = 0;
    buzz.mockClear();
    g.useCyc();
    finishClear(g);
    expect(rec.count('cyc')).toBe(1);
    expect(rec.log.map(([n]) => n).filter((n) => n !== 'setMusic')).toEqual(['cyc']);
    expect(buzz.mock.calls).toEqual([[HAPTIC.cyc]]);
  });
  it('hapşırık: her kullanımda sneeze sesi ve deseni bir kez; uyarı/ceza sesi yok', async () => {
    const { g, lc, rec, buzz } = await wire();
    lc.start();
    for (let k = 0; k < 2; k++) {
      stackRows(g, 7);
      g.sneezePieces = CFG.sneezePieces;
      rec.log.length = 0;
      buzz.mockClear();
      g.useSneeze();
      finishClear(g);
      expect(rec.log.map(([n]) => n).filter((n) => n !== 'setMusic')).toEqual(['sneeze']);
      expect(buzz.mock.calls).toEqual([[HAPTIC.sneeze]]);
    }
  });
  it('oyun sonu: over sesi, deseni ve menü müziğine geçiş bir kez', async () => {
    const { g, lc, rec, buzz } = await wire();
    lc.start();
    rec.log.length = 0;
    buzz.mockClear();
    g.gameOver('blockout');
    expect(rec.count('over')).toBe(1);
    expect(rec.args('setMusic')).toEqual([['menu', GAME_OVER_MUSIC_DELAY]]);
    expect(buzz.mock.calls).toEqual([[HAPTIC.over]]);
  });
  it('sürekli hareketler (kaydırma, döndürme, yumuşak indirme) titreşim üretmez', async () => {
    const { g, lc, rec, buzz } = await wire();
    lc.start();
    buzz.mockClear();
    for (let i = 0; i < 4; i++) {
      g.move(1);
      g.rotate(1);
      g.softDrop = true;
      g.update(40);
    }
    expect(rec.count('move') + rec.count('rotate')).toBeGreaterThan(0);
    expect(buzz).not.toHaveBeenCalled();
  });
});

describe('haptik', () => {
  const navSpy = () => ({ vibrate: vi.fn(() => true) });
  it('açık: desen olduğu gibi iletilir; kapalı: hiçbir çağrı yok; ayar anında okunur', () => {
    const nav = navSpy();
    let on = true;
    const buzz = createBuzz(() => on, true, nav);
    buzz(HAPTIC.lock);
    on = false;
    buzz(HAPTIC.clear(4));
    buzz(HAPTIC.over);
    expect(nav.vibrate.mock.calls).toEqual([[HAPTIC.lock]]);
  });
  it('desteksiz ortam: navigator yok / vibrate yok / vibrate hata atar → sessizce yok sayılır', () => {
    expect(detectVibrate(undefined)).toBe(false);
    expect(detectVibrate({})).toBe(false);
    expect(detectVibrate({ vibrate: () => true })).toBe(true);
    expect(() => createBuzz(() => true, true, undefined)(HAPTIC.hard)).not.toThrow();
    expect(() => createBuzz(() => true, true, {})(HAPTIC.hard)).not.toThrow();
    const bad = {
      vibrate: () => {
        throw new Error('blocked');
      },
    };
    expect(() => createBuzz(() => true, true, bad)(HAPTIC.hard)).not.toThrow();
    const nav = navSpy();
    createBuzz(() => true, false, nav)(HAPTIC.hard); // desteklenmiyor bilgisi önceliklidir
    expect(nav.vibrate).not.toHaveBeenCalled();
  });
  it('desenler kısa ve kademeli (yorgunluk yok): en uzun oyun sonu, olay sırasıyla tutarlı', () => {
    expect(HAPTIC.lock).toBeLessThan(HAPTIC.hard);
    const c = [1, 2, 3, 4].map((n) => patternMs(HAPTIC.clear(n)));
    expect([...c].sort((a, b) => a - b)).toEqual(c);
    for (const p of [HAPTIC.cyc, HAPTIC.clear(4)]) expect(patternMs(p)).toBeLessThanOrEqual(260);
    // NS4-24: hapşırık "ha… ha… HAPŞU" ritmi biraz daha uzun ama oyun sonundan kısa
    expect(patternMs(HAPTIC.sneeze)).toBeLessThanOrEqual(420);
    expect(patternMs(HAPTIC.sneeze)).toBeLessThan(patternMs(HAPTIC.over));
    expect(patternMs(HAPTIC.over)).toBeLessThanOrEqual(520);
    expect(patternMs(HAPTIC.over)).toBeGreaterThan(patternMs(HAPTIC.clear(4)));
  });
});

describe('reduced motion ses ve haptikten bağımsız', () => {
  it('ses/haptik kodu hareket tercihini okumaz; view.reducedMotion açıkken de titreşim ve ses çalışır', async () => {
    for (const f of ['../../src/audio/SoundManager.ts', '../../src/haptics/haptics.ts', '../../src/app/events.ts'])
      expect(sources[f], f).not.toMatch(/reducedMotion|prefers-reduced-motion/);
    const { g, lc, rec, buzz, deps } = await wire();
    (deps.view as unknown as { reducedMotion: boolean }).reducedMotion = true;
    lc.start();
    setupWell(g, 4);
    setCell(g, 0, 17, PIECE.Z); // NS4-22: tahta boşalmasın
    buzz.mockClear();
    dropVerticalI(g);
    expect(rec.args('clear')).toEqual([[4, 0]]);
    expect(buzz.mock.calls).toEqual([[HAPTIC.hard], [HAPTIC.clear(4)]]);
  });
});

describe('lifecycle boyunca müzik (gerçek Sound, sahte Web Audio)', () => {
  async function real() {
    installFakeAudio();
    const { Sound: S } = await import('../../src/audio/SoundManager');
    const sound = new S({ sound: true, music: true });
    const intervals = new Set<unknown>();
    const si = globalThis.setInterval,
      ci = globalThis.clearInterval;
    vi.stubGlobal('setInterval', (fn: () => void, ms: number) => {
      const id = si(fn, ms);
      intervals.add(id);
      return id;
    });
    vi.stubGlobal('clearInterval', (id: ReturnType<typeof setInterval> | undefined) => {
      intervals.delete(id);
      ci(id);
    });
    const w = await wire(1, sound);
    return { ...w, sound, intervals };
  }
  it('başlat / pause / resume / oyun sonu / yeni oyun / menü: çift başlama yok, her an en çok bir zamanlayıcı', async () => {
    const { g, lc, sound, intervals } = await real();
    expect(sound.unlocked).toBe(false); // sayfa açıldı, etkileşim yok
    lc.start(); // Oyna tıklaması
    expect([sound.unlocked, sound.musicKind, intervals.size]).toEqual([true, 'game', 1]);
    lc.pause(); // NS4-39: molada menü müziği (tek zamanlayıcı)
    expect([sound.musicKind, intervals.size]).toEqual(['menu', 1]);
    lc.resume();
    expect([sound.musicKind, intervals.size]).toEqual(['game', 1]);
    // hızlı pause/resume stresi
    for (let i = 0; i < 40; i++) {
      lc.pause();
      lc.resume();
      lc.resume();
      lc.pause();
      lc.pause();
      lc.resume();
    }
    expect([sound.musicKind, intervals.size]).toEqual(['game', 1]);
    g.gameOver('blockout');
    expect([sound.musicKind, intervals.size]).toEqual(['menu', 1]);
    // art arda yeni oyun
    lc.start();
    lc.start();
    lc.start();
    expect([sound.musicKind, intervals.size]).toEqual(['game', 1]);
    lc.toMenu();
    expect([sound.musicKind, intervals.size]).toEqual(['menu', 1]);
    vi.advanceTimersByTime(30_000);
    expect(intervals.size).toBe(1);
  });
  it('müzik ayarı kapalıyken oyun boyunca müzik düğümü ve zamanlayıcı oluşmaz', async () => {
    installFakeAudio();
    const { Sound: S } = await import('../../src/audio/SoundManager');
    const st = { sound: true, music: false };
    const sound = new S(st);
    const { lc } = await wire(1, sound);
    lc.start();
    lc.pause();
    lc.resume();
    expect([sound.musicOn, sound.musicSourceCount]).toEqual([false, 0]);
    st.music = true;
    sound.applySettings(); // ayar panelinden açılınca hemen başlar
    expect(sound.musicKind).toBe('game');
    lc.pause(); // NS4-39: molada menü müziği
    expect(sound.musicKind).toBe('menu');
  });
});

describe('erişilebilirlik', () => {
  it('rozetler: liste semantiği ve görünmeyen durum metni (görünür metin yalnızca ad)', async () => {
    expect(html).toMatch(/<div class="badges" id="o-badges" role="list"><\/div>/);
    vi.resetModules();
    const { renderBadges, BADGE_STATE_LABEL } = await import('../../src/ui/badges');
    const bx = dom.el('o-badges');
    renderBadges(bx as unknown as HTMLElement, ['ozmotik', 'akis'], ['akis']);
    // [rol, liste öğesinde title yok, görünür ad, ad ipucu, gizli durum sınıfı, gizli durum metni]
    const read = bx.children.map((c) => [
      c.getAttribute('role'),
      c.title,
      c.children[0]?.textContent,
      c.children[0]?.title,
      c.children[1]?.className,
      c.children[1]?.textContent,
    ]);
    expect(read).toEqual([
      ['listitem', '', 'Tetris ustası', 'İlk kez 4 satır birden', 'sr-only', ', kazanıldı'],
      ['listitem', '', 'T-spin ustası', 'T-spin ile ilk satır', 'sr-only', ', kilitli'],
      ['listitem', '', 'Kombo ustası', '5’li kombo', 'sr-only', ', bu oyunda kazanıldı'],
      ['listitem', '', 'Çok yaşa!', 'Bir oyunda 3 hapşırık', 'sr-only', ', kilitli'],
      ['listitem', '', 'Derin nefes', 'Toplam 100 satır', 'sr-only', ', kilitli'],
    ]);
    expect(Object.keys(BADGE_STATE_LABEL).sort()).toEqual(['earned', 'locked', 'new']);
  });
  it('sr-only görsel olarak gizler ama erişilebilirlik ağacından çıkarmaz', async () => {
    const { rule } = await import('../helpers/css');
    const r = rule('.sr-only');
    expect(r).toMatch(/clip-path: inset\(50%\)/);
    expect(r).toMatch(/width: 1px/);
    expect(r).not.toMatch(/display: none|visibility: hidden/);
  });
  it('Ayarlar: ilk odak ilk ayar kontrolü (Müzik); Tab sırası gruplar → Kaydet', () => {
    const set = html.slice(
      html.indexOf('<section id="scr-set"'),
      html.indexOf('</section>', html.indexOf('<section id="scr-set"')),
    );
    expect([...set.matchAll(/data-focus/g)]).toHaveLength(1);
    expect(set).toMatch(/data-k="music" data-focus/);
    const order = [...set.matchAll(/data-k="(\w+)"|data-back>(\w+)</g)].map((m) => m[1] ?? m[2]);
    expect(order).toEqual([
      'music',
      'musicVol',
      'menuMusic',
      'sound',
      'sfxVol',
      'Kaydet', // NS4-41: Oynanış ve İleri ayarlar kaldırıldı
    ]);
  });
  it('ses ve müzik kontrollerinin erişilebilir adı doğru (NS4-41: yalnızca Ses grubu)', () => {
    const set = html.slice(
      html.indexOf('<section id="scr-set"'),
      html.indexOf('</section>', html.indexOf('<section id="scr-set"')),
    );
    // sarmalayan <label> metni: Müzik, Ses efektleri
    expect(set).toMatch(/<label class="set">Ses efektleri<input type="checkbox" data-k="sound"/);
    expect(set).toMatch(/<label class="set">Müzik<input type="checkbox" data-k="music"/);
    expect(set).not.toMatch(/data-k="(haptics|ghost|das|arr|fps)"/);
    // aria-labelledby → kısa ad, aria-describedby → açıklama
    for (const [id, name] of [
      ['lbl-musicvol', 'Müzik düzeyi'],
      ['lbl-menumusic', 'Menü ve mola müziği'],
      ['lbl-sfxvol', 'Efekt düzeyi'],
    ] as const) {
      expect(set).toMatch(new RegExp(`<span id="${id}">${name}</span\\s*>`));
      expect(set).toMatch(new RegExp(`aria-labelledby="${id}"`));
    }
    for (const id of ['desc-musicvol', 'desc-menumusic', 'desc-sfxvol']) {
      expect(set).toMatch(new RegExp(`id="${id}"`));
      expect(set).toMatch(new RegExp(`aria-describedby="${id}"`));
    }
  });
  it('kaydırıcı değeri birimiyle okunur (aria-valuetext); NS4-39: ses düzeyi yüzde', async () => {
    const src = sources['../../src/ui/settingsPanel.ts'] ?? '';
    expect(src).toContain("inp.setAttribute('aria-valuetext', spoken)");
    const { VALUE_TEXT } = await import('../../src/ui/settingsPanel');
    expect(VALUE_TEXT.das(167)).toEqual(['167', '167 ms']);
    expect(VALUE_TEXT.arr(0)).toEqual(['0', '0 ms']);
    expect(VALUE_TEXT.musicVol(70)).toEqual(['%70', 'yüzde 70']);
    expect(VALUE_TEXT.sfxVol(80)).toEqual(['%80', 'yüzde 80']);
  });
  it('durum yalnızca ses/titreşimle verilmez: hapşırık sesi popup ile birlikte', () => {
    const ev = sources['../../src/app/events.ts'] ?? '';
    expect(ev).toMatch(/sound\.sneeze\(\);\s*buzz\(HAPTIC\.sneeze\);\s*popup\('HAPŞUU!', 'Çok yaşa!', 'sneeze'\);/);
    expect(ev).not.toMatch(/onRebound|onGarbage|sound\.warn/);
  });
});
