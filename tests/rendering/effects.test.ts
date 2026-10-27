// NS4-15: geri bildirim efektleri. Tarifler saf veridir; GameView gerçek Pixi sahne nesneleriyle (render olmadan,
// sahte canvas) kurulur. Blok dokusu, atlas ve mekanik süreler efektlerden etkilenmemelidir.
import { beforeEach, describe, expect, it } from 'vitest';
import { CFG, COLS, VIS } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import type { Game } from '../../src/game/Game';
import {
  AIRFLOW,
  Budget,
  HOLE_FX,
  LINE_FX,
  PETALS,
  PETAL_TINTS,
  REDUCED,
  RELIEF_FX,
  ROOM_FX,
  SNEEZE_FX,
  airflowRate,
  airflowSpeed,
  flavorOf,
  glowAlpha,
  holeAlpha,
  motionScale,
  LIQUID_FX,
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
  expect([v.liquid.c.visible, v.liquid.out]).toEqual([false, null]); // NS4-37
  expect(v.crest.visible).toBe(false);
  expect([v.glow.on, v.glow.s.visible, v.band.on, v.band.s.visible]).toEqual([false, false, false, false]);
  expect(v.glow.edges.every((e) => !e.visible && e.alpha === 0)).toBe(true);
  expect(live()).toHaveLength(0);
  expect(v.petals.every((p) => p.life <= 0 && !p.s.visible)).toBe(true); // NS4-22
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
    expect([v.liquid.c.visible, v.crest.visible]).toEqual([true, true]);
    H.step(CFG.drainMs / 2);
    // NS4-37: sıvı yükselir; yüzey dalgalı (maske ve parlak çizgi her karede çizilir)
    expect(v.liquid.top).toBeLessThan(VIS);
    expect(v.liquid.top).toBeGreaterThan(VIS - 9);
    expect(v.liquid.front.mask).toBe(v.liquid.frontMask);
    v.liquid.line.finishPoly(); // Pixi yolu tembel kaydeder
    expect((v.liquid.line.geometry.graphicsData[0]?.shape as { points: number[] }).points).toHaveLength(2 * 49);
    H.step(CFG.drainMs / 2);
    const dissolved = v.anim?.done?.reduce((a, b) => a + b, 0) ?? 0;
    expect(dissolved).toBeGreaterThan(8 * 8); // sıvıya giren hücreler bir kez parçacık salar
    expect(v.cells[(VIS - 1) * COLS].tint).not.toBe(0xffffff); // çözünürken pembeleşir (doku aynı)
    finishClear(g);
    expect(v.anim).toBeNull();
    expect(v.liquid.out).toBe(0); // söner (anim yuvasından bağımsız)
    expect(v.glow.on).toBe(true);
    expect(v.glow.s.tint).toBe(0xff79bd);
    H.step(2000);
    expectClean();
  });

  it('NS4-37: sıklamenden hemen sonra başka temizleme (oda açılışı) başlasa da sıvı söner, ekranda kalmaz', () => {
    stackRows(g, 8);
    g.useCyc();
    H.step(CFG.drainMs);
    finishClear(g);
    v.onClearStart({ kind: 'room', rows: [] }); // sıvı sönerken oda açılışı: anim yuvası el değiştirir
    expect(v.anim?.kind).toBe('room');
    H.step(LIQUID_FX.recedeMs + 50);
    expect(v.anim?.kind).toBe('room');
    expect([v.liquid.c.visible, v.liquid.out, v.crest.visible]).toEqual([false, null, false]);
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
    expect(v.liquid.front.width).toBeCloseTo(COLS * v.L.cell, 6);
    expect(v.liquid.front.y + v.liquid.front.height).toBeCloseTo(VIS * v.L.cell, 4);
    H.resize(844, 390);
    H.step(CFG.drainMs);
    finishClear(g);
    H.step(2000);
    expectClean();
    expect(countNodes(v.app.stage)).toBe(nodes);
  });
});

// NS4-22: büyük açılma anı
describe('büyük açılma anı', () => {
  const petals = () => v.petals.filter((p) => p.life > 0);

  it('tarifler: Tetris < oda < Tam Ferahlık; kırmızı/uyarı rengi yok, yapraklar sıklamen pembesi', () => {
    const k = ['tetris', 'room', 'allclear'] as const;
    for (let i = 1; i < k.length; i++) {
      const [a, b] = [RELIEF_FX[k[i - 1]], RELIEF_FX[k[i]]];
      expect(b.peak).toBeGreaterThan(a.peak);
      expect(b.petals).toBeGreaterThan(a.petals);
      expect(b.sparkles).toBeGreaterThan(a.sparkles);
    }
    for (const r of Object.values(RELIEF_FX)) expect(r.edge).toBeGreaterThan(0); // tahta kenarı da parlar
    for (const t of PETAL_TINTS) expect((t >> 16) & 0xff).toBeGreaterThan(0xd0); // pembe: kırmızı kanal yüksek
    expect(PETALS.count).toBeGreaterThanOrEqual(RELIEF_FX.allclear.petals);
  });

  it('Tetris: temizlenen satırlardan parıltı ve yaprak; tahta kenarıyla parlar; yapraklar yukarı ve ortaya süzülür', () => {
    wire();
    setupWell(g, 4);
    setCell(g, 0, 17, PIECE.Z);
    dropVerticalI(g);
    v.relief('tetris');
    const R = RELIEF_FX.tetris,
      c = v.L.cell;
    expect([v.glow.on, v.glow.s.tint, v.glow.edgeK]).toEqual([true, R.glow, R.edge]);
    expect(petals()).toHaveLength(R.petals);
    for (const p of petals()) {
      expect(p.s.y).toBeGreaterThan(15 * c); // satır 16..19 civarı
      expect(PETAL_TINTS).toContain(p.s.tint);
      expect(p.s.texture).toBe(v.petalTex);
    }
    const y0 = petals().map((p) => p.s.y);
    const dx0 = petals().map((p) => Math.abs(p.s.x - (COLS * c) / 2));
    H.step(900);
    const alive = petals();
    expect(alive.length).toBeGreaterThan(0);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(alive.map((p) => p.s.y))).toBeLessThan(avg(y0) - 3 * c); // yükselir
    expect(avg(alive.map((p) => Math.abs(p.s.x - (COLS * c) / 2)))).toBeLessThan(avg(dx0)); // sinüs ağzına
    // kanat çırpar: genişlik değişir, yükseklik sabit
    for (const p of alive) expect(p.s.scale.x).toBeLessThanOrEqual(p.base + 1e-9);
    finishClear(g);
    H.step(3000);
    expectClean();
  });

  it('oda / Tam Ferahlık: tahtanın altından doğar; Tam Ferahlık hafifçe sarsar', () => {
    v.relief('room');
    expect(petals()).toHaveLength(RELIEF_FX.room.petals);
    for (const p of petals()) expect(p.s.y).toBeGreaterThan((VIS - 2) * v.L.cell);
    expect(v.shake).toBe(0);
    v.killPetals();
    v.relief('allclear');
    expect(petals()).toHaveLength(RELIEF_FX.allclear.petals);
    expect(v.shake).toBeGreaterThan(0);
    expect(v.glow.s.tint).toBe(RELIEF_FX.allclear.glow);
    H.step(3000);
    expectClean();
  });

  it('havuz taşmaz: art arda anlar yaprak havuzu kadar yaprak doğurur', () => {
    for (let i = 0; i < 5; i++) v.relief('allclear');
    expect(petals().length).toBeLessThanOrEqual(PETALS.count);
    expect(v.petalLayer.children).toHaveLength(PETALS.count);
  });

  it('reduced motion: parıltı ve yaprak azalır, sarsıntı azalır', () => {
    v.reducedMotion = true;
    v.relief('allclear');
    expect(petals().length).toBeLessThanOrEqual(Math.ceil(RELIEF_FX.allclear.petals * REDUCED.particles));
    expect(live().length).toBeLessThanOrEqual(Math.ceil(RELIEF_FX.allclear.sparkles * REDUCED.particles));
    expect(v.shake).toBeLessThanOrEqual(RELIEF_FX.allclear.shake * REDUCED.shake + 1e-9);
  });

  it('yeni oyun ve yeniden yerleşim yaprakları söndürür; doku yenilenir', () => {
    v.relief('allclear');
    v.resetFx();
    expect(petals()).toHaveLength(0);
    v.relief('allclear');
    const old = v.petalTex;
    H.resize(390, 844);
    expect(petals()).toHaveLength(0);
    expect(v.petalTex).not.toBe(old);
    expect(v.petals.every((p) => p.s.texture === v.petalTex)).toBe(true);
  });
});

// NS4-30: hava kanalı boşlukları parlar
describe('boşluk işaretleri', () => {
  const marks = () => v.holes.filter((h) => h.visible);

  it('nefes ritmi: alpha sınırlar içinde gidip gelir; reduced motion sabit', () => {
    let lo = 1,
      hi = 0;
    for (let t = 0; t < HOLE_FX.period; t += 40) {
      const a = holeAlpha(t, false);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    expect(hi).toBeLessThanOrEqual(HOLE_FX.alpha + 1e-9);
    expect(lo).toBeGreaterThanOrEqual(HOLE_FX.alpha * (1 - HOLE_FX.depth) - 1e-9);
    expect(hi - lo).toBeGreaterThan(0.1);
    expect(holeAlpha(0, true)).toBe(holeAlpha(700, true));
  });

  it('yalnızca gri bulutçuk içeren sıralardaki boş hücreler; renkli sıralar ve boş tahta işaretsiz', () => {
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [4]);
    fillRow(g, 20, PIECE.GARBAGE, [4, 7]);
    fillRow(g, 19, PIECE.S, [0, 1]); // renkli sıra: işaret yok
    v.syncBoard();
    const c = v.L.cell;
    expect(marks().map((h) => [Math.round((h.x - c / 2) / c), Math.round((h.y - c / 2) / c)])).toEqual([
      [4, VIS - 2],
      [7, VIS - 2],
      [4, VIS - 1],
    ]);
    for (const h of marks()) expect(h.tint).toBe(HOLE_FX.tint);
    clearBoard(g);
    v.syncBoard();
    expect(marks()).toHaveLength(0);
  });

  it('oda başında kanal işaretlenir; satır temizlenince güncellenir; oyun sonunda söner', () => {
    g.reset({ rooms: true });
    v.syncAll();
    expect(marks()).toHaveLength(4); // 1. oda: 4 sıra × tek kanal
    H.step(100);
    expect(marks()[0]?.alpha).toBeGreaterThan(0);
    v.onGameOver();
    H.step(50);
    for (const h of marks()) expect(h.alpha).toBe(0);
  });

  it('havuz taşmaz', () => {
    clearBoard(g);
    for (let y = 2; y < 22; y++) fillRow(g, y, PIECE.GARBAGE, [1, 3, 5, 7, 9]);
    v.syncBoard();
    expect(marks()).toHaveLength(HOLE_FX.max);
  });
});
