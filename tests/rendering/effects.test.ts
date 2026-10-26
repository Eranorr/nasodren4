// NS4-15: geri bildirim efektleri. Tarifler saf veridir; GameView gerçek Pixi sahne nesneleriyle (render olmadan,
// sahte canvas) kurulur. Blok dokusu, atlas ve mekanik süreler efektlerden etkilenmemelidir.
import { beforeEach, describe, expect, it } from 'vitest';
import { CFG, COLS, VIS } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import type { Game } from '../../src/game/Game';
import {
  AIRFLOW,
  Budget,
  LINE_FX,
  REDUCED,
  ROOM_FX,
  SNEEZE_FX,
  airflowRate,
  airflowSpeed,
  flavorOf,
  glowAlpha,
  motionScale,
} from '../../src/rendering/effects';
import type { View } from '../../src/rendering/GameView';
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
import { createView, stubCanvasDom, type ViewHarness } from '../helpers/pixiView';

describe('efekt tarifleri (saf)', () => {
  it('temizleme dili: T-spin satırı Nörorefleks, dört satır Ozmotik, diğerleri drenaj', () => {
    expect(flavorOf({ n: 1, tspin: 0 })).toBe('drain');
    expect(flavorOf({ n: 3, tspin: 0 })).toBe('drain');
    expect(flavorOf({ n: 4, tspin: 0 })).toBe('osmotic');
    expect(flavorOf({ n: 2, tspin: 2 })).toBe('neuro');
    expect(flavorOf({ n: 1, tspin: 1 })).toBe('neuro');
    expect(flavorOf({ n: 0, tspin: 2 })).toBe('drain'); // satırsız T-spin temizleme dili değil, yalnızca kıvılcım
  });

  it('reduced motion sarsıntı ve parçacıkları belirgin biçimde azaltır, titreşimli vuruşu kapatır', () => {
    expect(motionScale(false)).toEqual({ shake: 1, particles: 1, glow: 1, flicker: true });
    const r = motionScale(true);
    expect(r.shake).toBeLessThanOrEqual(0.3);
    expect(r.particles).toBeLessThanOrEqual(0.35);
    expect(r.flicker).toBe(false);
    expect(r).toMatchObject(REDUCED);
  });

  it('ışıma eğrisi uçlarda 0, tepeyi aşmaz, süre bitince 0', () => {
    for (const beats of [1, 2]) {
      expect(glowAlpha(0, 0.3, beats)).toBe(0);
      expect(glowAlpha(1, 0.3, beats)).toBe(0);
      for (let p = 0; p < 1; p += 0.01) expect(glowAlpha(p, 0.3, beats)).toBeLessThanOrEqual(0.3);
    }
    expect(glowAlpha(0.25, 0.3, 2)).toBeGreaterThan(0.2); // iki vuruşun ilk tepesi
  });

  it('parçacık bütçesi kesirleri biriktirir (deterministik)', () => {
    const b = new Budget();
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += b.take(2, 0.3);
    expect(sum).toBe(6);
    expect(new Budget().take(3, 1)).toBe(3);
  });

  it('Ozmotik, Nörorefleks ve hapşırık farklı görsel dillerde', () => {
    expect(LINE_FX.osmotic.bloom).toBeGreaterThan(0);
    expect(LINE_FX.osmotic.splash).toBeGreaterThan(LINE_FX.drain.splash);
    expect(LINE_FX.neuro.streak).toBeGreaterThan(0);
    expect(LINE_FX.neuro.splash).toBe(0);
    // NS4-24: hapşırık önce hazırlanır (ha… ha…), sonra patlar; kırmızı uyarı rengi kullanılmaz
    expect(SNEEZE_FX.windup).toBeGreaterThan(0.3);
    expect(SNEEZE_FX.windup).toBeLessThan(0.6);
    expect(SNEEZE_FX.confetti).toBeGreaterThan(0);
    expect(SNEEZE_FX.tints).not.toContain(0xff5a1f);
  });

  it('mekanik süreler değişmedi', () => {
    expect([CFG.lineClearMs, CFG.sneezeMs, CFG.drainMs]).toEqual([300, 650, 800]);
  });
});

// ---- GameView ----
let H: ViewHarness;
let g: Game;
let v: View;
const live = () => v.parts.filter((p) => p.life > 0);
const countNodes = (c: { children: readonly unknown[] }): number =>
  c.children.reduce<number>((n, ch) => n + 1 + countNodes(ch as { children: readonly unknown[] }), 0);

/** events.ts'teki view bağlantılarının görsel alt kümesi (ses/popup yok). */
function wire() {
  g.on('lock', (cells) => v.onLock(cells));
  g.on('harddrop', (d) => v.onHard(d));
  g.on('scored', (e) => v.onScored(e));
  g.on('clearstart', (e) => v.onClearStart(e));
  g.on('clearend', () => v.onClearEnd());
  g.on('roomclear', () => v.onRoomClear());
}

/** Görsel durumun tamamen temiz olduğunu doğrular (efekt sonrası temizlik). */
function expectClean() {
  expect(v.anim).toBeNull();
  expect(v.flashes.every((f) => !f.visible && f.height === v.L.cell)).toBe(true);
  expect(v.wave.visible).toBe(false);
  expect(v.crest.visible).toBe(false);
  expect([v.glow.on, v.glow.s.visible, v.band.on, v.band.s.visible]).toEqual([false, false, false, false]);
  expect(v.glow.edges.every((e) => !e.visible && e.alpha === 0)).toBe(true);
  expect(live()).toHaveLength(0);
  expect(v.shake).toBe(0);
  expect([v.boardC.x, v.boardC.y]).toEqual([v.L.board.x, v.L.board.y]);
  // blok hücreleri dokunulmamış: yalnızca atlas dokuları, tam boy, opak, renksiz
  const blockTex = new Set(Object.values(v.tex));
  for (const s of v.cells.filter((x) => x.visible)) {
    expect(blockTex.has(s.texture)).toBe(true);
    expect([s.alpha, s.tint]).toEqual([1, 0xffffff]);
    expect(s.scale.x).toBeCloseTo(v.L.cell / s.texture.orig.width, 6);
    expect(s.scale.y).toBeCloseTo(v.L.cell / s.texture.orig.width, 6);
  }
}

beforeEach(async () => {
  stubCanvasDom();
  g = createGame(3);
  H = await createView(g);
  v = H.view;
  wire();
});

describe('GameView efektleri: başlama, bitiş ve temizlik', () => {
  it('tek satır drenajı: flaş + damlalar, mekanik süresinde biter, iz bırakmaz', () => {
    setupWell(g, 1);
    const base = v.atlasBase;
    dropVerticalI(g);
    expect(v.anim).toMatchObject({ kind: 'lines', flavor: 'drain', dur: CFG.lineClearMs });
    expect(v.flashes[0].visible).toBe(true);
    expect(v.flashes[0].tint).toBe(LINE_FX.drain.flash);
    expect(live().length).toBeGreaterThanOrEqual(COLS * 3); // hücre başına 2 sıçrama + 1 süzülme
    H.step(CFG.lineClearMs);
    finishClear(g);
    expect(v.anim).toBeNull();
    H.step(1500);
    expectClean();
    expect(v.atlasBase).toBe(base); // efekt yeni atlas/doku üretmez
  });

  it('Tetris → Ozmotik: büyüyen flaş, turkuaz ışıma, belirgin sarsıntı', () => {
    setupWell(g, 4);
    dropVerticalI(g);
    expect(v.anim?.flavor).toBe('osmotic');
    expect(v.flavor).toBe('drain'); // tüketildi
    expect(v.glow.on).toBe(true);
    expect(v.glow.s.tint).toBe(LINE_FX.osmotic.glow);
    expect(v.shake).toBeGreaterThanOrEqual(LINE_FX.osmotic.shake);
    H.step(CFG.lineClearMs - 16);
    expect(v.flashes[0].height).toBeGreaterThan(v.L.cell * 1.5);
    finishClear(g);
    H.step(1500);
    expectClean();
  });

  it('T-spin → Nörorefleks: T merkezinden sönümlü, yerçekimsiz kıvılcımlar ve yatay çizgiler', () => {
    // NS4-01 T-spin double tahtası (scoring.test.ts ile aynı)
    clearBoard(g);
    fillRow(g, 21, PIECE.L, [4]);
    fillRow(g, 20, PIECE.L, [3, 4, 5]);
    setCell(g, 3, 19, PIECE.L);
    placePiece(g, PIECE.T, 1, 3, 19);
    expect(g.rotate(1)).toBe(true);
    expect(g.tspinKind()).toBe(2);
    g.hardDrop();
    expect(v.anim?.flavor).toBe('neuro');
    const sparks = live().filter((p) => p.drag > 0 && p.g === 0);
    expect(sparks.length).toBeGreaterThanOrEqual(12 + COLS * 2 * 2 - 4);
    expect(sparks.some((p) => p.sx > 1 && p.sy < 1)).toBe(true); // yatay çizgi
    finishClear(g);
    H.step(1500);
    expectClean();
  });

  it('satırsız T-spin: yalnızca küçük kıvılcım, temizleme dili değişmez', () => {
    v.lastLock = [20 * COLS + 3, 20 * COLS + 4, 20 * COLS + 5, 21 * COLS + 4];
    v.onScored({ n: 0, tspin: 2 });
    expect(live()).toHaveLength(6);
    expect(v.flavor).toBe('drain');
    H.step(800);
    expect(live()).toHaveLength(0);
  });

  it('hapşırık: önce şişme (parçacık yok), sonra konfeti ve sarsıntıyla yukarı savrulma; sonra tamamen temiz', () => {
    stackRows(g, 7); // savrulan sıralar 15..17 → görünür 13..15
    expect(g.useSneeze()).toBe(true);
    expect(v.anim).toMatchObject({ kind: 'sneeze', dur: CFG.sneezeMs });
    expect(v.flashes.every((f) => !f.visible)).toBe(true);
    const cell = v.cells[13 * COLS];
    H.step(CFG.sneezeMs * SNEEZE_FX.windup * 0.5);
    expect(live()).toHaveLength(0);
    expect(v.shake).toBe(0);
    expect(cell.y).toBeCloseTo(13 * v.L.cell + v.L.cell / 2, 6); // hazırlıkta yerinde, yalnızca şişer
    H.step(CFG.sneezeMs * SNEEZE_FX.windup * 0.6);
    expect(v.anim?.burst).toBe(true);
    expect(live().length).toBeGreaterThan(0);
    expect(v.shake).toBeGreaterThan(0);
    expect([v.glow.on, v.glow.s.tint]).toEqual([true, SNEEZE_FX.glow]);
    H.step(CFG.sneezeMs * 0.3);
    expect(cell.y).toBeLessThan(13 * v.L.cell); // yukarı savruldu
    expect(cell.rotation).not.toBe(0);
    expect(cell.alpha).toBeLessThan(1);
    const untouched = v.cells[19 * COLS]; // alttaki sıralar yerinde
    expect([untouched.y, untouched.alpha]).toEqual([19 * v.L.cell + v.L.cell / 2, 1]);
    finishClear(g);
    expect(v.cells.filter((c) => c.visible).every((c) => c.rotation === 0)).toBe(true); // gizli hücre görünürken sıfırlanır
    H.step(1500);
    expectClean();
  });

  it('sıklamen: dalga + tepe şeridi, hücreler çözünür; bitişte ×2 vuruşu, sonra tamamen temiz', () => {
    stackRows(g, 8);
    expect(g.useCyc()).toBe(true);
    expect([v.wave.visible, v.crest.visible]).toEqual([true, true]);
    H.step(CFG.drainMs);
    const dissolved = v.anim?.done?.reduce((a, b) => a + b, 0) ?? 0;
    expect(dissolved).toBeGreaterThan(8 * 8); // sıvıya giren hücreler bir kez parçacık salar
    expect(v.cells[(VIS - 1) * COLS].tint).not.toBe(0xffffff); // çözünürken pembeleşir (doku aynı)
    finishClear(g);
    expect(v.anim?.recede).toBe(0);
    expect(v.glow.on).toBe(true);
    expect(v.glow.s.tint).toBe(0xff79bd);
    H.step(2000);
    expectClean();
  });

  it('resetFx yeni oyunda süren her efekti temizler', () => {
    setupWell(g, 4);
    dropVerticalI(g);
    v.sneezeBurst([VIS - 1]);
    H.step(50);
    v.resetFx();
    g.reset();
    v.syncAll();
    expect(v.overT).toBe(-1);
    expectClean();
  });
});

describe('reduced motion', () => {
  function tetrisParticles(reduced: boolean) {
    v.reducedMotion = reduced;
    v.budget.reset();
    setupWell(g, 4);
    v.shake = 0;
    dropVerticalI(g);
    const n = live().length,
      shake = v.shake;
    finishClear(g);
    H.step(1500);
    return { n, shake };
  }

  it('Tetris: parçacık ve sarsıntı belirgin biçimde az; süre ve durum aynı', () => {
    const full = tetrisParticles(false);
    const red = tetrisParticles(true);
    expect(red.n).toBeLessThanOrEqual(Math.ceil(full.n * 0.35));
    expect(red.n).toBeGreaterThan(0);
    expect(red.shake).toBeLessThanOrEqual(full.shake * 0.3);
    expectClean();
  });

  it('hard drop ve hapşırık sarsıntısı azalır; hapşırık vuruşu yumuşar, konfeti az', () => {
    v.reducedMotion = true;
    v.onHard(18);
    expect(v.shake).toBeLessThanOrEqual(0.25);
    v.shake = 0;
    stackRows(g, 7);
    g.useSneeze();
    H.step(CFG.sneezeMs * SNEEZE_FX.windup + 1);
    expect(v.shake).toBeLessThanOrEqual(SNEEZE_FX.shake * 0.3);
    expect(live().length).toBeLessThanOrEqual(Math.ceil(3 * COLS * SNEEZE_FX.confetti * REDUCED.particles));
    expect(v.glow.peak).toBeCloseTo(SNEEZE_FX.glowPeak * REDUCED.glow, 6);
    finishClear(g);
    H.step(2000);
    expectClean();
  });

  it('mekanik zamanlama değişmez (aynı süre sonunda temizleme biter)', () => {
    v.reducedMotion = true;
    setupWell(g, 2);
    dropVerticalI(g);
    expect(g.stateT).toBe(CFG.lineClearMs);
    expect(v.anim?.dur).toBe(CFG.lineClearMs);
    g.update(CFG.lineClearMs);
    expect(g.state).toBe('play');
  });
});

// NS4-27: Sinüs Odaları görselleri
describe('odalar', () => {
  it('temizlenen gri bulutçuklar gülümser ve yukarı süzülür; renkli hücreler eski dille sıkışır', () => {
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [9]);
    for (let x = 0; x < 3; x++) setCell(g, x, 21, PIECE.S);
    dropVerticalI(g);
    H.step(CFG.lineClearMs * 0.5);
    const gray = v.cells[(VIS - 1) * COLS + 5],
      color = v.cells[(VIS - 1) * COLS + 1];
    expect(gray.texture).toBe(v.happyTex);
    expect(gray.y).toBeLessThan((VIS - 1) * v.L.cell + v.L.cell / 2);
    expect(gray.scale.x).toBeGreaterThanOrEqual(v.L.cell / v.happyTex.orig.width); // sıkışmaz, hafifçe büyür
    expect(color.texture).not.toBe(v.happyTex);
    expect(color.scale.y).toBeLessThan(color.scale.x);
    finishClear(g);
    H.step(1500);
    expectClean();
  });

  it('"Sinüs açıldı": serin vuruş, alttan kabarcıklar; geçişte kalan hücreler söner, sonra yeni oda tahtası', () => {
    g.reset({ rooms: true });
    v.syncAll();
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [9]);
    for (let x = 0; x < 9; x++) setCell(g, x, 20, PIECE.L); // kalan renkli sıra
    dropVerticalI(g);
    finishClear(g); // → roomclear
    expect(v.anim).toMatchObject({ kind: 'room', dur: CFG.roomClearMs });
    expect([v.glow.on, v.glow.s.tint]).toEqual([true, ROOM_FX.glow]);
    expect(live().length).toBeGreaterThanOrEqual(ROOM_FX.bubbles * 0.9);
    H.step(CFG.roomClearMs * 0.9);
    const left = v.cells.filter((c) => c.visible);
    expect(left.length).toBeGreaterThan(0);
    for (const c of left) expect(c.alpha).toBeLessThan(0.3);
    finishClear(g); // → yeni oda
    H.step(2500);
    expectClean();
    expect(v.cells.filter((c) => c.visible).length).toBe(g.grayCount() - 0);
  });

  it('reduced motion: kabarcıklar ve sarsıntı azalır', () => {
    v.reducedMotion = true;
    v.onRoomClear();
    expect(live().length).toBeLessThanOrEqual(Math.ceil(ROOM_FX.bubbles * REDUCED.particles));
    expect(v.shake).toBeLessThanOrEqual(ROOM_FX.shake * REDUCED.shake + 1e-9);
    H.step(2500);
    expectClean();
  });
});

// NS4-21: hava akışı (blokların arkasında, kendi havuzu)
describe('hava akışı', () => {
  const airLive = () => v.air.filter((m) => m.life > 0);

  it('oran ve hız tıkanıklıkla azalır; tam tıkanıklıkta doğum yok', () => {
    expect(airflowRate(0)).toBe(AIRFLOW.rate);
    expect(airflowRate(1)).toBe(0);
    expect(airflowRate(0.5)).toBeLessThan(airflowRate(0.2));
    expect(airflowSpeed(0)).toBe(1);
    expect(airflowSpeed(1)).toBeCloseTo(0.35, 9);
  });

  it('açık sinüste zerrecikler boş alanda, blokların arkasında yükselir; havuz sabit', () => {
    const nodes = countNodes(v.app.stage);
    H.step(2000);
    const motes = airLive();
    expect(motes.length).toBeGreaterThan(3);
    expect(v.boardC.getChildIndex(v.airLayer)).toBe(0); // en arkada
    const y0 = motes.map((m) => m.s.y);
    H.step(100);
    motes.forEach((m, i) => m.life > 0 && expect(m.s.y).toBeLessThan(y0[i] ?? 0));
    expect(v.air).toHaveLength(AIRFLOW.count);
    expect(countNodes(v.app.stage)).toBe(nodes);
    expect(live().length).toBe(0); // efekt parçacık havuzunu kullanmaz
  });

  it('dolu sütunun içinde doğmaz (yığının üstünde)', () => {
    stackRows(g, 6); // görünür satır 14..19 dolu (9. sütun boş)
    H.step(3000);
    for (const m of airLive()) {
      const col = Math.floor(m.x0 / v.L.cell);
      if (col !== 9) expect(m.s.y).toBeLessThan(14 * v.L.cell);
    }
  });

  it('tam tıkanıklıkta, oyun bitince ve reduced motion altında doğum yok; resetFx söndürür', () => {
    stackRows(g, 20);
    H.step(3000);
    expect(airLive()).toHaveLength(0);
    clearBoard(g);
    v.reducedMotion = true;
    H.step(3000);
    expect(airLive()).toHaveLength(0);
    v.reducedMotion = false;
    H.step(2000);
    expect(airLive().length).toBeGreaterThan(0);
    v.resetFx();
    expect(airLive()).toHaveLength(0);
    g.gameOver('lockout');
    H.step(3000);
    expect(airLive()).toHaveLength(0);
  });
});

describe('performans ve dayanıklılık', () => {
  it('parçacık havuzu taşmaz: art arda 25 Tetris + hapşırık konfetisi + sıklamen', () => {
    const nodes = countNodes(v.app.stage);
    for (let i = 0; i < 25; i++) {
      setupWell(g, 4);
      dropVerticalI(g);
      v.sneezeBurst([VIS - 1]);
      H.step(48);
      finishClear(g);
    }
    stackRows(g, 8);
    g.useCyc();
    H.step(CFG.drainMs);
    expect(v.parts).toHaveLength(420);
    expect(v.pc.children).toHaveLength(420);
    expect(v.partIdx).toBeGreaterThanOrEqual(0);
    expect(v.partIdx).toBeLessThan(420);
    expect(live().length).toBeLessThanOrEqual(420);
    expect(countNodes(v.app.stage)).toBe(nodes); // sahneye yeni nesne eklenmez
    finishClear(g);
    H.step(2500);
    expectClean();
  });

  it('aktif efekt sırasında resize güvenli: Tetris ve sıklamen ortasında boyut değişimi', () => {
    const nodes = countNodes(v.app.stage);
    setupWell(g, 4);
    dropVerticalI(g);
    H.step(100);
    H.resize(390, 844);
    const c = v.L.cell;
    expect(live()).toHaveLength(0); // eski ölçüdeki parçacıklar bırakıldı
    expect(v.flashes[0].width).toBeCloseTo(COLS * c, 6);
    expect(v.glow.s.width).toBeCloseTo(COLS * c, 6);
    expect(v.glow.s.height).toBeCloseTo(VIS * c, 6);
    H.step(100);
    expect(v.flashes[0].y).toBeLessThanOrEqual(v.anim!.rows[0] * c);
    finishClear(g);
    H.step(1500);
    expectClean();

    stackRows(g, 8);
    g.useCyc();
    H.step(300);
    H.resize(1920, 1080);
    H.step(16);
    expect(v.wave.width).toBeCloseTo(COLS * v.L.cell, 6);
    expect(v.wave.y + v.wave.height).toBeCloseTo(VIS * v.L.cell, 4);
    H.resize(844, 390);
    H.step(CFG.drainMs);
    finishClear(g);
    H.step(2000);
    expectClean();
    expect(countNodes(v.app.stage)).toBe(nodes);
  });
});
