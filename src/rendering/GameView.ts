/* =====================================================================
   VIEW (PixiJS): sprite havuzları, texture yaşam döngüsü, efektler
   NS4-03: main.ts'ten taşındı. Game'i yalnızca okur; oyun kuralı, skor,
   storage, CTA veya içerik seçimi yapmaz.
   ===================================================================== */
import * as PIXI from 'pixi.js';
import { COLS, HIDDEN, VIS, CFG } from '../config/gameConfig';
import { PIECE, SHAPES } from '../game/pieces';
import {
  COLORS,
  FACE_ID,
  blockRecord,
  createBlockAtlas,
  createDropCanvas,
  createHappyCloudCanvas,
  createPetalCanvas,
  createLiquidCanvas,
  loadBlockArt,
  type BlockArt,
} from './textures';
import {
  bloomIndex,
  bloomRotation,
  createPlantAtlas,
  loadPlantArt,
  stemIndex,
  PLANT_COLS,
  PLANT_TILES,
} from './plants';
import type { PlantArt } from './plants';
import { PLANTS } from '../game/plants';
import {
  Budget,
  CYC_DONE,
  AIRFLOW,
  CYC_TINTS,
  HOLE_FX,
  LINE_FX,
  LIQUID_FX,
  NEURO_BURST,
  NEURO_TINTS,
  OSMOTIC_TINT,
  PETALS,
  PETAL_TINTS,
  RELIEF_FX,
  ROOM_FX,
  SNEEZE_FX,
  SPARKLE_TINTS,
  airflowRate,
  airflowSpeed,
  flavorOf,
  glowAlpha,
  holeAlpha,
  motionScale,
  type ClearFlavor,
  type MotionScale,
  type ReliefKind,
} from './effects';
import type { Game } from '../game/Game';
import type { PendingClear, ScoredEvent } from '../types/events';
import type { BlockId, PendingClearKind, PieceSlot, TetrominoType } from '../types/game';
import type { Layout, Pt } from '../types/layout';
import type { Settings } from '../types/settings';

type TextureMap = Readonly<Record<BlockId, PIXI.Texture>>;
interface Particle {
  readonly s: PIXI.Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: number;
  base: number;
  /** NS4-15: hız sönümü (1/s; 0 = yok) ve en-boy çarpanları (kıvılcım çizgisi). */
  drag: number;
  sx: number;
  sy: number;
}
interface ClearAnim {
  readonly kind: PendingClearKind;
  readonly rows: number[];
  t: number;
  readonly dur: number;
  /** NS4-15: satır temizlemenin görsel dili ('lines' dışında 'drain'). */
  readonly flavor: ClearFlavor;
  /** Sıklamen: çözünme parçacığı salınmış hücreler (görünür hücre indeksi). */
  readonly done?: Uint8Array;
  /** NS4-24: hapşırık patladı mı (hazırlık evresi bitti; konfeti bir kez). */
  burst?: boolean;
}
/** NS4-15: Texture.WHITE ile tahta üstü vuruşlu ışıma (yeni doku yok). */
interface Glow {
  readonly s: PIXI.Sprite;
  on: boolean;
  t: number;
  dur: number;
  peak: number;
  beats: number;
  /** Tahta kenarı çerçevesi (4 ince şerit; yalnızca tahta ışımasında). edgeK: kenar/zemin parlaklık oranı, 0 = kapalı. */
  readonly edges: readonly PIXI.Sprite[];
  edgeK: number;
}
/** NS4-21: hava akışı zerreciği (kendi havuzu; efekt parçacıklarından bağımsız). */
interface AirMote {
  readonly s: PIXI.Sprite;
  vy: number;
  life: number;
  max: number;
  x0: number;
  phase: number;
}
/** NS4-22: sıklamen yaprağı (kendi havuzu; dönerek ve kanat çırparak yukarı süzülür). */
interface Petal {
  readonly s: PIXI.Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  base: number;
  spin: number;
  flip: number;
  phase: number;
}
interface BounceState {
  readonly s: PIXI.Sprite;
  t: number;
}
/** View'in en son senkronladığı Game sürüm sayaçları (kirli bayrak). */
interface SeenVersions {
  piece: number;
  board: number;
  queue: number;
  ghost: boolean;
}

/** Tahta hücresi → BlockId. Tahtaya yalnızca Game yazar ve yalnızca 0..8 saklar; buraya 0 olmayan değerler gelir. */
const asBlock = (v: number): BlockId => v as BlockId;

/** NS4-34: iki boş bitki katmanı (sap, çiçek) ekler; merkezde, hücreyle aynı boyutta (bkz. View.setPlant). */
function withPlant(s: PIXI.Sprite): PIXI.Sprite {
  for (let i = 0; i < 2; i++) {
    const c = new PIXI.Sprite();
    c.anchor.set(0.5);
    c.visible = false;
    s.addChild(c);
  }
  return s;
}

export class View {
  readonly app: PIXI.Application<HTMLCanvasElement>;
  readonly game: Game;
  readonly settings: Readonly<Pick<Settings, 'ghost'>>; // NS4-03: ayar nesnesi dışarıdan verilir (yalnızca ghost okunur)
  readonly root: PIXI.Container;
  readonly boardC: PIXI.Container;
  readonly cellLayer: PIXI.Container;
  readonly ghostLayer: PIXI.Container;
  readonly activeLayer: PIXI.Container;
  readonly fxLayer: PIXI.Container;
  /** NS4-21: hava akışı katmanı (blokların ve hayaletin arkasında). */
  readonly airLayer: PIXI.Container;
  readonly air: AirMote[];
  airAcc: number;
  /** NS4-30: bulutçuk sıralarındaki boşluk işaretleri (hava kanalı; blokların arkasında). */
  readonly holeLayer: PIXI.Container;
  readonly holes: PIXI.Sprite[];
  holeT: number;
  /** NS4-22: sıklamen yaprakları katmanı (en üstte). */
  readonly petalLayer: PIXI.Container;
  readonly petals: Petal[];
  // buildTextures() içinde atanır; ilk çağrıya kadar tanımsızdır (bkz. NS4-02-VITE-MIGRATION.md)
  tex!: TextureMap;
  ghostTex!: TextureMap;
  dropTex!: PIXI.Texture;
  /** NS4-37: sıklamen sıvısının renk geçişi. */
  liquidTex!: PIXI.Texture;
  /** NS4-27: temizlenirken gülümseyen gri bulutçuk. */
  happyTex!: PIXI.Texture;
  /** NS4-22: sıklamen yaprağı. */
  petalTex!: PIXI.Texture;
  atlasBase?: PIXI.BaseTexture;
  /** NS4-32: sıklamen blok görselleri; yüklenene kadar null (atlas jöle çizimiyle kurulur). */
  art: BlockArt | null = null;
  /** NS4-34: parça başına tek sıklamen: parçalar, atlas ve karoları (yüklenene kadar bitki çizilmez). */
  plantArt: PlantArt | null = null;
  plantBase?: PIXI.BaseTexture;
  plantTex: readonly PIXI.Texture[] = [];
  /**
   * NS4-37: sıklamen özütü sıvısı: arka ve ön katman (renk geçişi + dalgalı yüzey maskesi) ve yüzey çizgisi.
   * `top`: yüzeyin hücre cinsinden yüksekliği (tahtanın üstünden); `out`: sönme süresi (ms, sönmüyorsa null).
   */
  readonly liquid: {
    readonly c: PIXI.Container;
    readonly back: PIXI.Sprite;
    readonly front: PIXI.Sprite;
    readonly backMask: PIXI.Graphics;
    readonly frontMask: PIXI.Graphics;
    readonly line: PIXI.Graphics;
    top: number;
    phase: number;
    out: number | null;
  };
  readonly cells: PIXI.Sprite[];
  readonly active: PIXI.Sprite[];
  readonly ghost: PIXI.Sprite[];
  readonly holdC: PIXI.Container;
  readonly nextC: PIXI.Container;
  readonly holdS: PIXI.Sprite[];
  readonly nextS: PIXI.Sprite[][];
  readonly flashes: PIXI.Sprite[];
  readonly pc: PIXI.ParticleContainer;
  readonly parts: Particle[];
  partIdx: number;
  readonly bounce: BounceState[];
  shake: number;
  anim: ClearAnim | null;
  overT: number;
  readonly seen: SeenVersions;
  /** NS4-15: işletim sistemi "hareketi azalt" tercihi (bootstrap atar). Sarsıntı ve parçacıklar azalır; süreler aynı. */
  reducedMotion: boolean;
  /** Sıradaki satır temizlemesinin dili (`scored` → `clearstart` sırası; Game önce scored yayar). */
  flavor: ClearFlavor;
  lastLock: readonly number[];
  readonly glow: Glow;
  readonly band: Glow;
  readonly crest: PIXI.Sprite;
  readonly budget: Budget;
  /** layout() ilk kez çağrılana kadar yoktur; sync*() yalnızca layout() sonrasında çağrılır, update() kendi kontrolünü yapar. */
  L!: Layout;
  constructor(app: PIXI.Application<HTMLCanvasElement>, game: Game, settings: Readonly<Pick<Settings, 'ghost'>>) {
    this.app = app;
    this.game = game;
    this.settings = settings;
    this.root = new PIXI.Container();
    app.stage.addChild(this.root);
    this.boardC = new PIXI.Container(); // sarsıntı için ayrı konteyner
    this.root.addChild(this.boardC);
    this.cellLayer = new PIXI.Container();
    this.ghostLayer = new PIXI.Container();
    this.activeLayer = new PIXI.Container();
    this.fxLayer = new PIXI.Container();
    this.airLayer = new PIXI.Container();
    this.holeLayer = new PIXI.Container();
    this.boardC.addChild(
      this.airLayer,
      this.holeLayer,
      this.ghostLayer,
      this.cellLayer,
      this.activeLayer,
      this.fxLayer,
    );
    this.holes = [];
    for (let i = 0; i < HOLE_FX.max; i++) {
      const s = new PIXI.Sprite();
      s.anchor.set(0.5);
      s.blendMode = PIXI.BLEND_MODES.ADD;
      s.tint = HOLE_FX.tint;
      s.visible = false;
      this.holeLayer.addChild(s);
      this.holes.push(s);
    }
    this.holeT = 0;
    this.air = [];
    for (let i = 0; i < AIRFLOW.count; i++) {
      const s = new PIXI.Sprite();
      s.anchor.set(0.5);
      s.blendMode = PIXI.BLEND_MODES.ADD; // koyu zeminde gri toz değil, parlak kabarcık
      s.visible = false;
      this.airLayer.addChild(s);
      this.air.push({ s, vy: 0, life: 0, max: 1, x0: 0, phase: 0 });
    }
    this.airAcc = 0;
    // NS4-02: orijinaldeki "this.tex = this.ghostTex = this.dropTex = this.waveTex = null" ataması kaldırıldı;
    // alanlar ilk buildTextures() çağrısına kadar undefined kalır (yalnızca truthiness ile kontrol ediliyorlar).

    // 200 görünür hücre sprite'ı (havuz) — her karede yeniden oluşturma yok
    this.cells = [];
    for (let i = 0; i < COLS * VIS; i++) {
      const s = withPlant(new PIXI.Sprite());
      s.anchor.set(0.5);
      s.visible = false;
      this.cellLayer.addChild(s);
      this.cells.push(s);
    }
    this.active = [];
    this.ghost = [];
    for (let i = 0; i < 4; i++) {
      const a = withPlant(new PIXI.Sprite());
      a.anchor.set(0.5);
      this.activeLayer.addChild(a);
      this.active.push(a);
      const g = new PIXI.Sprite();
      g.anchor.set(0.5);
      this.ghostLayer.addChild(g);
      this.ghost.push(g);
    }
    // önizlemeler
    this.holdC = new PIXI.Container();
    this.nextC = new PIXI.Container();
    this.root.addChild(this.holdC, this.nextC);
    this.holdS = this.mkMini(this.holdC);
    this.nextS = [];
    for (let k = 0; k < 5; k++) this.nextS.push(this.mkMini(this.nextC));

    // satır flaşları
    this.flashes = [];
    for (let i = 0; i < 10; i++) {
      const f = new PIXI.Sprite(PIXI.Texture.WHITE);
      f.blendMode = PIXI.BLEND_MODES.ADD;
      f.visible = false;
      this.fxLayer.addChild(f);
      this.flashes.push(f);
    }
    // NS4-37: sıklamen sıvısı (dokusu buildTextures() içinde); en altta, blok parçacıklarının arkasında
    {
      const c = new PIXI.Container();
      const back = new PIXI.Sprite(),
        front = new PIXI.Sprite(),
        backMask = new PIXI.Graphics(),
        frontMask = new PIXI.Graphics(),
        line = new PIXI.Graphics();
      back.tint = LIQUID_FX.backTint;
      back.alpha = LIQUID_FX.backAlpha;
      back.mask = backMask;
      front.mask = frontMask;
      c.addChild(back, backMask, front, frontMask, line);
      c.visible = false;
      this.fxLayer.addChildAt(c, 0);
      this.liquid = { c, back, front, backMask, frontMask, line, top: VIS, phase: 0, out: null };
    }
    // NS4-15: dalga tepesi, tahta ışıması ve satır bandı (Texture.WHITE; yeni doku yok)
    const white = () => {
      const s = new PIXI.Sprite(PIXI.Texture.WHITE);
      s.blendMode = PIXI.BLEND_MODES.ADD;
      s.visible = false;
      s.alpha = 0;
      this.fxLayer.addChild(s);
      return s;
    };
    this.crest = white();
    this.glow = { s: white(), on: false, t: 0, dur: 1, peak: 0, beats: 1, edges: [0, 1, 2, 3].map(white), edgeK: 0 };
    this.band = { s: white(), on: false, t: 0, dur: 1, peak: 0, beats: 1, edges: [], edgeK: 0 };
    // parçacıklar
    this.pc = new PIXI.ParticleContainer(420, { vertices: true, position: true, tint: true });
    this.fxLayer.addChild(this.pc);
    // NS4-22: yapraklar dönüp kanat çırpar (ParticleContainer döndürme/ölçek taşımadığı için ayrı, küçük havuz)
    this.petalLayer = new PIXI.Container();
    this.fxLayer.addChild(this.petalLayer);
    this.petals = [];
    for (let i = 0; i < PETALS.count; i++) {
      const s = new PIXI.Sprite();
      s.anchor.set(0.5);
      s.visible = false;
      this.petalLayer.addChild(s);
      this.petals.push({ s, vx: 0, vy: 0, life: 0, max: 1, base: 0, spin: 0, flip: 0, phase: 0 });
    }
    this.parts = [];
    for (let i = 0; i < 420; i++) {
      const s = new PIXI.Sprite();
      s.anchor.set(0.5);
      s.alpha = 0;
      s.position.set(-999, -999);
      this.pc.addChild(s);
      this.parts.push({ s, vx: 0, vy: 0, life: 0, max: 1, g: 0, base: 0, drag: 0, sx: 1, sy: 1 });
    } // base: emitDrop atar (yalnızca life > 0 iken okunur)
    this.partIdx = 0;

    this.bounce = []; // kilitlenen hücrelerin "oturma" yaylanması
    this.shake = 0;
    this.anim = null; // aktif temizleme animasyonu
    this.overT = -1;
    this.seen = { piece: -1, board: -1, queue: -1, ghost: settings.ghost };
    this.reducedMotion = false;
    this.flavor = 'drain';
    this.lastLock = [];
    this.budget = new Budget();
    // NS4-32: görseller gelince atlas yeniden kurulur (layout henüz yoksa ilk layout() zaten kurar)
    // NS4-34: bitki parçaları da (karolar ve bitki ayrı ayrı yedeğe düşebilir)
    void Promise.all([loadBlockArt(), loadPlantArt()]).then(([art, plant]) => {
      if (!art && !plant) return;
      this.art = art;
      this.plantArt = plant;
      if (this.L) this.buildTextures(this.L.cell);
    });
  }

  /**
   * NS4-34: hücre sprite'ının bitki katmanları (sap, çiçek). Tip 1-7 ve bitki baytı varken; gri, hayalet ve bitki
   * yüklenmeden gizli. Çocuk sprite'lar hücrenin konum, ölçek, döndürme ve saydamlığını izler.
   */
  setPlant(s: PIXI.Sprite, type: number, code: number) {
    const [stem, bloom] = s.children as PIXI.Sprite[];
    if (!stem || !bloom) return;
    if (!this.plantTex.length || !code || type < 1 || type > 7) {
      stem.visible = bloom.visible = false;
      return;
    }
    const t = type as TetrominoType;
    stem.texture = this.plantTex[stemIndex(code)] ?? PIXI.Texture.EMPTY;
    stem.visible = true;
    const bi = bloomIndex(t, code);
    bloom.visible = bi >= 0;
    if (bi >= 0) {
      bloom.texture = this.plantTex[bi] ?? PIXI.Texture.EMPTY;
      bloom.rotation = bloomRotation(code);
    }
  }

  mkMini(parent: PIXI.Container): PIXI.Sprite[] {
    const arr: PIXI.Sprite[] = [];
    for (let i = 0; i < 4; i++) {
      const s = withPlant(new PIXI.Sprite());
      s.anchor.set(0.5);
      parent.addChild(s);
      arr.push(s);
    }
    return arr;
  }

  buildTextures(cell: number) {
    const res = this.app.renderer.resolution;
    const px = Math.max(8, Math.round(cell * res));
    const oldBase = this.atlasBase,
      oldTex = [this.tex, this.ghostTex],
      oldPlantBase = this.plantBase,
      oldPlantTex = this.plantTex;
    const oldDrop = this.dropTex,
      oldLiquid = this.liquidTex,
      oldHappy = this.happyTex,
      oldPetal = this.petalTex;
    const { atlas, P } = createBlockAtlas(px, this.art); // NS4-03: çizim rendering/textures.ts içinde
    const base = (this.atlasBase = PIXI.BaseTexture.from(atlas));
    // i: atlas sütunu (BLOCK_IDS sırası). NS4-04: önce bütün blok, sonra bütün hayalet karoları oluşturulur.
    this.tex = blockRecord((_id, i) => new PIXI.Texture(base, new PIXI.Rectangle(i * P + 2, 2, px, px)));
    this.ghostTex = blockRecord((_id, i) => new PIXI.Texture(base, new PIXI.Rectangle(i * P + 2, P + 2, px, px)));
    // NS4-34: bitki atlası (blok karosuyla aynı px: hücre sprite'ının çocuğu olarak ölçeği 1)
    if (this.plantArt) {
      const pa = createPlantAtlas(px, this.plantArt);
      const pb = (this.plantBase = PIXI.BaseTexture.from(pa.atlas));
      this.plantTex = Array.from(
        { length: PLANT_TILES },
        (_, i) =>
          new PIXI.Texture(
            pb,
            new PIXI.Rectangle((i % PLANT_COLS) * pa.P + 2, Math.floor(i / PLANT_COLS) * pa.P + 2, px, px),
          ),
      );
    }
    // blok karolarıyla aynı çerçeve (2 px kenar boşluğu dışarıda): aynı boyutta görünür
    this.happyTex = new PIXI.Texture(
      PIXI.BaseTexture.from(createHappyCloudCanvas(px)),
      new PIXI.Rectangle(2, 2, px, px),
    );
    this.petalTex = PIXI.Texture.from(createPetalCanvas(cell * res * 0.6));
    for (const p of this.petals) p.s.texture = this.petalTex;
    // damlacık
    this.dropTex = PIXI.Texture.from(createDropCanvas(cell, res));
    // NS4-37: sıvı renk geçişi (iki katman aynı dokuyu kullanır)
    this.liquidTex = PIXI.Texture.from(createLiquidCanvas());
    this.liquid.back.texture = this.liquid.front.texture = this.liquidTex;
    for (const p of this.parts) p.s.texture = this.dropTex;
    for (const m of this.air) m.s.texture = this.dropTex;
    for (const h of this.holes) h.texture = this.dropTex;
    // eski dokuları güvenle serbest bırak (sprite'lar sync ile yenisine geçer)
    this.seen.piece = this.seen.board = this.seen.queue = -1;
    this.syncAll();
    for (const o of oldTex) if (o) for (const t of Object.values(o)) t.destroy(false);
    if (oldBase) oldBase.destroy();
    if (oldPlantBase !== this.plantBase) {
      for (const t of oldPlantTex) t.destroy(false);
      if (oldPlantBase) oldPlantBase.destroy();
    }
    if (oldDrop) oldDrop.destroy(true);
    if (oldLiquid) oldLiquid.destroy(true);
    if (oldHappy) oldHappy.destroy(true);
    if (oldPetal) oldPetal.destroy(true);
  }

  layout(L: Layout) {
    this.L = L;
    const c = L.cell;
    this.boardC.position.set(L.board.x, L.board.y);
    for (const b of this.bounce) b.s.scale.set(1);
    this.bounce.length = 0;
    for (let i = 0; i < 10; i++) {
      this.flashes[i].width = COLS * c;
      this.flashes[i].height = c;
    }
    // NS4-15: süren efekt yeni ölçüye uyar; eski ölçüdeki parçacıklar bırakılır (konumları eski hücre boyutunda)
    this.killParticles();
    this.killAir();
    this.killPetals();
    this.glow.s.width = this.band.s.width = this.crest.width = COLS * c;
    this.glow.s.height = VIS * c;
    this.band.s.height = c;
    this.band.s.y = (VIS - 1) * c;
    // kenar çerçevesi: üst, alt, sol, sağ
    const bw = COLS * c,
      bh = VIS * c,
      th = Math.max(2, Math.round(c * 0.14));
    const [top, bottom, left, right] = this.glow.edges;
    for (const [s, x, y, w, h] of [
      [top, 0, 0, bw, th],
      [bottom, 0, bh - th, bw, th],
      [left, 0, 0, th, bh],
      [right, bw - th, 0, th, bh],
    ] as const) {
      s.position.set(x, y);
      s.width = w;
      s.height = h;
    }
    this.buildTextures(c);
  }

  setSize(s: PIXI.Sprite, size: number) {
    s.scale.set(size / s.texture.orig.width);
  }

  syncAll() {
    this.syncBoard();
    this.syncPiece();
    this.syncQueue();
  }

  syncBoard() {
    const g = this.game,
      b = g.board,
      c = this.L.cell;
    for (let r = 0; r < VIS; r++)
      for (let col = 0; col < COLS; col++) {
        const v = b[(r + HIDDEN) * COLS + col],
          s = this.cells[r * COLS + col];
        if (v) {
          s.texture = this.tex[asBlock(v)];
          this.setPlant(s, v, g.plant[(r + HIDDEN) * COLS + col]);
          s.visible = true;
          s.alpha = 1;
          s.tint = 0xffffff;
          s.rotation = 0; // NS4-24: hapşırıkta savrulan hücreler döner
          this.setSize(s, c);
          s.position.set(col * c + c / 2, r * c + c / 2);
        } else s.visible = false;
      }
    this.syncHoles();
    this.seen.board = g.boardVer;
  }

  /** NS4-30: gri bulutçuk içeren görünür sıralardaki boş hücrelere işaret koyar (havuz kadar; fazlası gösterilmez). */
  syncHoles() {
    const b = this.game.board,
      c = this.L.cell;
    let n = 0;
    for (let r = 0; r < VIS && n < this.holes.length; r++) {
      const row = (r + HIDDEN) * COLS;
      let gray = false;
      for (let col = 0; col < COLS; col++) if (b[row + col] === PIECE.GARBAGE) gray = true;
      if (!gray) continue;
      for (let col = 0; col < COLS && n < this.holes.length; col++) {
        if (b[row + col]) continue;
        const h = this.holes[n++];
        h.position.set(col * c + c / 2, r * c + c / 2);
        h.scale.set((HOLE_FX.size * c) / this.dropTex.orig.width);
        h.visible = true;
      }
    }
    for (; n < this.holes.length; n++) this.holes[n].visible = false;
  }

  syncPiece() {
    const g = this.game,
      c = this.L.cell,
      type = g.type;
    const has = type !== 0 && g.state === 'play';
    const gy = has && this.settings.ghost ? g.ghostY() : -1;
    for (let i = 0; i < 4; i++) {
      const a = this.active[i],
        gh = this.ghost[i];
      if (!has) {
        a.visible = gh.visible = false;
        continue;
      }
      const sh = SHAPES[type][g.rot]; // NS4-04: has → type 1..7 (daraltma); döngü boyunca g.rot değişmez
      const cx = g.x + sh[i][0],
        cy = g.y + sh[i][1] - HIDDEN;
      a.texture = this.tex[type];
      this.setPlant(a, type, PLANTS[type][g.rot][i]);
      this.setSize(a, c);
      a.position.set(cx * c + c / 2, cy * c + c / 2);
      a.visible = cy >= 0;
      if (gy >= 0 && gy !== g.y) {
        const gyy = gy + sh[i][1] - HIDDEN;
        gh.texture = this.ghostTex[type];
        this.setSize(gh, c);
        gh.position.set(cx * c + c / 2, gyy * c + c / 2);
        gh.visible = gyy >= 0;
      } else gh.visible = false;
    }
    this.seen.piece = g.pieceVer;
    this.seen.ghost = this.settings.ghost;
  }

  placeMini(sprites: readonly PIXI.Sprite[], type: PieceSlot, cx = 0, cy = 0, mc = 0, alpha = 1) {
    // NS4-02: varsayılanlar yalnızca type=0 çağrısı için (erken dönüş)
    if (!type) {
      for (const s of sprites) s.visible = false;
      return;
    }
    const sh = SHAPES[type][0];
    let minx = 9,
      maxx = -1,
      miny = 9,
      maxy = -1;
    for (const p of sh) {
      minx = Math.min(minx, p[0]);
      maxx = Math.max(maxx, p[0]);
      miny = Math.min(miny, p[1]);
      maxy = Math.max(maxy, p[1]);
    }
    const ox = cx - ((maxx - minx + 1) * mc) / 2,
      oy = cy - ((maxy - miny + 1) * mc) / 2;
    for (let i = 0; i < 4; i++) {
      const s = sprites[i];
      s.texture = this.tex[type];
      this.setPlant(s, type, PLANTS[type][0][i]);
      this.setSize(s, mc);
      s.position.set(ox + (sh[i][0] - minx) * mc + mc / 2, oy + (sh[i][1] - miny) * mc + mc / 2);
      s.visible = true;
      s.alpha = alpha;
    }
  }

  syncQueue() {
    const g = this.game,
      L = this.L;
    this.placeMini(this.holdS, g.hold, L.holdSlot.x, L.holdSlot.y, L.mini, g.canHold ? 1 : 0.35);
    for (let k = 0; k < 5; k++) {
      const slot: Pt | undefined = L.nextSlots[k]; // portrede 2, yatayda 5 slot var
      if (!slot) {
        this.placeMini(this.nextS[k], 0);
        continue;
      }
      this.placeMini(this.nextS[k], g.queue[k], slot.x, slot.y, k === 0 ? L.miniBig : L.mini, 1);
    }
    this.seen.queue = g.queueVer;
  }

  // ---- efektler ----
  // NS4-15: efektler yalnızca mevcut parçacık havuzunu (420, halka tampon), satır flaşlarını, sıvı dalgayı ve
  // Texture.WHITE katmanlarını kullanır. Blok dokuları ve atlas değişmez; süreler mekanikteki gibidir (CFG).
  get motion(): MotionScale {
    return motionScale(this.reducedMotion);
  }

  /** Sarsıntı ister (reduced motion altında belirgin biçimde azaltılır). Sürmekte olan daha güçlü sarsıntıyı ezmez. */
  kick(v: number) {
    this.shake = Math.max(this.shake, Math.min(1, v * this.motion.shake));
  }

  /** Hücre başına parçacık sayısı (reduced motion çarpanı + kesir birikimi). */
  count(per: number): number {
    return this.budget.take(per, this.motion.particles);
  }

  emitDrop(
    x: number,
    y: number,
    tint: number,
    vx: number,
    vy: number,
    life: number,
    g: number,
    scale: number,
    drag = 0,
    sx = 1,
    sy = 1,
  ) {
    const p = this.parts[this.partIdx];
    this.partIdx = (this.partIdx + 1) % this.parts.length;
    p.s.position.set(x, y);
    p.s.tint = tint;
    p.s.alpha = 1;
    p.s.scale.set(scale * sx, scale * sy);
    p.base = scale;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.g = g;
    p.drag = drag;
    p.sx = sx;
    p.sy = sy;
  }

  /** Bütün parçacıkları anında söndürür (havuz boyutu değişmez). */
  killParticles() {
    for (const p of this.parts) {
      p.life = 0;
      p.s.alpha = 0;
      p.s.position.set(-999, -999);
    }
  }

  /** NS4-21: hava akışı zerreciklerini söndürür (havuz boyutu değişmez). */
  killAir() {
    for (const m of this.air) {
      m.life = 0;
      m.s.visible = false;
    }
    this.airAcc = 0;
  }

  /** NS4-22: bütün yaprakları söndürür (havuz boyutu değişmez). */
  killPetals() {
    for (const p of this.petals) {
      p.life = 0;
      p.s.visible = false;
    }
  }

  /** NS4-22: (x, y)'den (vx, vy) hızıyla bir yaprak doğurur (havuz doluysa en eskisinin yerine geçmez; doğmaz). */
  spawnPetal(x: number, y: number, vx: number, vy: number) {
    const p = this.petals.find((q) => q.life <= 0);
    if (!p) return;
    const c = this.L.cell,
      r = (a: readonly [number, number]) => a[0] + Math.random() * (a[1] - a[0]);
    p.max = p.life = r(PETALS.life);
    p.vx = vx;
    p.vy = vy;
    p.base = (r(PETALS.size) * c) / this.petalTex.orig.height;
    p.spin = r(PETALS.spin) * (Math.random() < 0.5 ? -1 : 1);
    p.flip = r(PETALS.flip) * Math.PI * 2;
    p.phase = Math.random() * Math.PI * 2;
    p.s.position.set(x, y);
    p.s.rotation = Math.random() * Math.PI * 2;
    p.s.tint = PETAL_TINTS[(Math.random() * PETAL_TINTS.length) | 0];
    p.s.scale.set(p.base);
    p.s.alpha = 0;
    p.s.visible = true;
  }

  /** NS4-22: yapraklar dönerek, kanat çırparak yukarı ve sinüs ağzına (tahta ortası) doğru süzülür. */
  updatePetals(dt: number) {
    const sec = dt / 1000,
      c = this.L.cell,
      mid = (COLS * c) / 2,
      d = Math.exp(-PETALS.drag * sec);
    for (const p of this.petals) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0 || p.s.y < -c * 2) {
        p.life = 0;
        p.s.visible = false;
        continue;
      }
      const f = 1 - p.life / p.max;
      p.vx = (p.vx + (mid - p.s.x) * PETALS.pull * sec) * d;
      p.vy = (p.vy - PETALS.lift * c * sec) * d;
      p.phase += p.flip * sec;
      p.s.x += p.vx * sec + Math.sin(p.phase * 0.5) * c * 0.6 * sec;
      p.s.y += p.vy * sec;
      p.s.rotation += p.spin * sec;
      p.s.scale.set(p.base * Math.max(0.25, Math.abs(Math.cos(p.phase))), p.base);
      p.s.alpha = Math.min(1, f / 0.1, (1 - f) / 0.4);
    }
  }

  /** NS4-21: boş bir sütunda, yığın yüzeyinin biraz üstünde bir zerrecik doğurur (yer yoksa doğmaz). */
  spawnAir(congestion: number) {
    const m = this.air.find((a) => a.life <= 0);
    if (!m) return;
    const c = this.L.cell,
      b = this.game.board,
      col = (Math.random() * COLS) | 0;
    let top = 0;
    while (top < VIS && !b[(top + HIDDEN) * COLS + col]) top++;
    if (top < 2) return;
    const [l0, l1] = AIRFLOW.life,
      [v0, v1] = AIRFLOW.speed,
      [z0, z1] = AIRFLOW.size;
    m.max = m.life = l0 + Math.random() * (l1 - l0);
    m.vy = c * (v0 + Math.random() * (v1 - v0)) * airflowSpeed(congestion);
    m.x0 = col * c + c * (0.2 + Math.random() * 0.6);
    m.phase = Math.random() * Math.PI * 2;
    m.s.position.set(m.x0, (top - 0.3 - Math.random() * Math.min(4, top * 0.5)) * c);
    m.s.scale.set(((z0 + Math.random() * (z1 - z0)) * c) / this.dropTex.orig.width);
    m.s.tint = AIRFLOW.tints[(Math.random() * AIRFLOW.tints.length) | 0];
    m.s.alpha = 0;
    m.s.visible = true;
  }

  /** NS4-21: hava akışı: oyun sürerken doğar, tıkanıklıkla seyrelir; reduced motion'da kapalı. */
  updateAir(dt: number) {
    const g = this.game;
    const flowing = g.state === 'play' || g.state === 'clearing' || g.state === 'draining';
    if (flowing && !this.reducedMotion && this.dropTex) {
      const cg = g.congestion();
      this.airAcc += (dt / 1000) * airflowRate(cg);
      for (; this.airAcc >= 1; this.airAcc--) this.spawnAir(cg);
    } else this.airAcc = 0;
    for (const m of this.air) {
      if (m.life <= 0) continue;
      m.life -= dt;
      if (m.life <= 0 || m.s.y < -this.L.cell) {
        m.life = 0;
        m.s.visible = false;
        continue;
      }
      const f = 1 - m.life / m.max;
      m.s.y -= (m.vy * dt) / 1000;
      m.s.x = m.x0 + Math.sin(m.phase + f * Math.PI * 2) * this.L.cell * 0.12;
      m.s.alpha = AIRFLOW.alpha * Math.sin(Math.PI * f);
    }
  }

  startGlow(gl: Glow, tint: number, peak: number, dur: number, beats: number, edgeK = 0) {
    const m = this.motion;
    gl.s.tint = tint;
    gl.s.alpha = 0;
    gl.s.visible = true;
    gl.peak = peak * m.glow;
    gl.beats = m.flicker ? beats : 1;
    gl.dur = dur;
    gl.t = 0;
    gl.on = true;
    gl.edgeK = gl.edges.length ? edgeK : 0;
    for (const e of gl.edges) {
      e.tint = tint;
      e.alpha = 0;
      e.visible = gl.edgeK > 0;
    }
  }

  stopGlow(gl: Glow) {
    gl.on = false;
    gl.s.visible = false;
    gl.s.alpha = 0;
    gl.edgeK = 0;
    for (const e of gl.edges) {
      e.visible = false;
      e.alpha = 0;
    }
  }

  updateGlow(gl: Glow, dt: number) {
    if (!gl.on) return;
    gl.t += dt;
    const p = gl.t / gl.dur;
    if (p >= 1) return this.stopGlow(gl);
    const a = glowAlpha(p, gl.peak, gl.beats);
    gl.s.alpha = a;
    if (gl.edgeK) for (const e of gl.edges) e.alpha = Math.min(0.9, a * gl.edgeK);
  }

  /** Yeni oyun: süren bütün efektler temizlenir (NS4-15 öncesi lifecycle'daki sıfırlamaları da kapsar). */
  resetFx() {
    this.overT = -1;
    this.anim = null;
    this.flavor = 'drain';
    this.hideLiquid();
    for (const f of this.flashes) f.visible = false;
    if (this.L) for (const f of this.flashes) f.height = this.L.cell;
    this.stopGlow(this.glow);
    this.stopGlow(this.band);
    this.killParticles();
    this.killAir();
    this.killPetals();
    this.budget.reset();
    this.shake = 0;
    if (this.L) this.boardC.position.set(this.L.board.x, this.L.board.y);
  }

  onLock(cells: readonly number[]) {
    this.lastLock = cells;
    for (const idx of cells) {
      const r = ((idx / COLS) | 0) - HIDDEN;
      if (r < 0) continue;
      const s = this.cells[r * COLS + (idx % COLS)];
      this.bounce.push({ s, t: 0 });
    }
  }

  onHard(d: number) {
    this.kick(Math.min(1, 0.25 + d * 0.04));
  }

  /** `scored` (Game bunu `clearstart`'tan önce yayar): temizleme dilini seçer; T-spin'de kilit noktasından kıvılcım. */
  onScored(e: Pick<ScoredEvent, 'n' | 'tspin'>) {
    if (!this.L) return;
    if (e.n > 0) this.flavor = flavorOf(e);
    if (e.tspin) this.neuroBurst(e.n > 0 ? 1 : 0.5);
  }

  /** Son kilitlenen parçanın görünür merkezi (hücre koordinatı) veya yoksa null. */
  lockCenter(): Pt | null {
    let sx = 0,
      sy = 0,
      n = 0;
    for (const idx of this.lastLock) {
      const r = ((idx / COLS) | 0) - HIDDEN;
      if (r < 0) continue;
      sx += idx % COLS;
      sy += r;
      n++;
    }
    return n ? { x: sx / n, y: sy / n } : null;
  }

  /** Nörorefleks: T merkezinden düz, hızla sönümlenen radyal kıvılcımlar (yerçekimi yok). */
  neuroBurst(power: number) {
    const o = this.lockCenter();
    if (!o) return;
    const c = this.L.cell,
      dw = this.dropTex.orig.width;
    const k = this.count(NEURO_BURST * power);
    for (let i = 0; i < k; i++) {
      const ang = (i / k) * Math.PI * 2 + Math.random() * 0.3,
        sp = c * (5 + Math.random() * 3);
      this.emitDrop(
        o.x * c + c / 2,
        o.y * c + c / 2,
        NEURO_TINTS[i % NEURO_TINTS.length],
        Math.cos(ang) * sp,
        Math.sin(ang) * sp,
        260 + Math.random() * 120,
        0,
        ((0.22 + Math.random() * 0.12) * c) / dw,
        5.5,
      );
    }
  }

  onClearStart(e: PendingClear) {
    const c = this.L.cell,
      g = this.game;
    const flavor: ClearFlavor = e.kind === 'lines' ? this.flavor : 'drain';
    this.flavor = 'drain';
    this.syncBoard();
    this.anim = {
      kind: e.kind,
      rows: e.rows.map((r) => r - HIDDEN).filter((r) => r >= 0),
      t: 0,
      dur: { cyc: CFG.drainMs, sneeze: CFG.sneezeMs, room: CFG.roomClearMs, lines: CFG.lineClearMs }[e.kind],
      flavor,
      ...(e.kind === 'cyc' ? { done: new Uint8Array(COLS * VIS) } : {}),
    };
    const rows = this.anim.rows;
    if (e.kind === 'sneeze' || e.kind === 'room') {
      // NS4-24: hazırlık ("ha… ha…") update() içinde; patlama evresinde konfeti ve sarsıntı
      // NS4-27: oda kutlaması onRoomClear() (roomclear olayı, clearstart'tan hemen önce) ve update() içinde
    } else if (e.kind !== 'cyc') {
      const R = LINE_FX[flavor],
        dw = this.dropTex.orig.width;
      rows.forEach((r, i) => {
        const f = this.flashes[i];
        f.visible = true;
        f.alpha = 1;
        f.height = c;
        f.y = r * c;
        f.tint = R.flash;
      });
      const lc = this.lockCenter(),
        tcol = lc ? lc.x : COLS / 2;
      for (const r of rows)
        for (let col = 0; col < COLS; col++) {
          const v = asBlock(g.board[(r + HIDDEN) * COLS + col] || 1);
          // NS4-02: utils.string2hex(x) npm paketinde her oturumda bir deprecation uyarısı basıyor (CDN pixi.min.js basmıyordu).
          // Aynı hesaplamanın kendisi (string2hex = Color.shared.setValue(x).toNumber()) doğrudan çağrılıyor; sonuç birebir aynı.
          const tint = PIXI.Color.shared.setValue(COLORS[v]).toNumber();
          const x = col * c + c / 2;
          // sıçrayan damlalar (drenaj: blok rengi + beyaz; Ozmotik: + turkuaz, tahta kenarlarına doğru açılır)
          for (let k = 0, n = this.count(R.splash); k < n; k++) {
            const out = flavor === 'osmotic' ? ((col + 0.5 - COLS / 2) / (COLS / 2)) * c * (2 + Math.random() * 3) : 0;
            this.emitDrop(
              x + (Math.random() - 0.5) * c * 0.6,
              r * c + c / 2,
              k % 3 === 1 ? 0xffffff : k % 3 === 2 ? OSMOTIC_TINT : tint,
              out + (Math.random() - 0.5) * c * 3,
              (Math.random() * 0.5 - (flavor === 'osmotic' ? 1.0 : 0.9)) * c * 6,
              500 + Math.random() * 350,
              c * 38,
              (((0.45 + Math.random() * 0.5) * c) / dw) * 1.2,
            );
          }
          // süzülen damla: satırın altından yavaşça aşağı akar (sıvı boşalma hissi)
          for (let k = 0, n = this.count(R.drip); k < n; k++)
            this.emitDrop(
              x + (Math.random() - 0.5) * c * 0.7,
              r * c + c * 0.85,
              tint,
              (Math.random() - 0.5) * c * 0.4,
              c * (0.6 + Math.random() * 0.8),
              420 + Math.random() * 260,
              c * 24,
              ((0.22 + Math.random() * 0.18) * c) / dw,
            );
          // yatay kıvılcım çizgisi (Nörorefleks: T sütunundan dışa)
          for (let k = 0, n = this.count(R.streak); k < n; k++) {
            const dir = col >= tcol ? 1 : -1;
            this.emitDrop(
              x,
              r * c + c / 2 + (Math.random() - 0.5) * c * 0.5,
              NEURO_TINTS[(col + k) % NEURO_TINTS.length],
              dir * c * (7 + Math.random() * 4),
              (Math.random() - 0.5) * c * 0.8,
              260 + Math.random() * 120,
              0,
              ((0.24 + Math.random() * 0.12) * c) / dw,
              5,
              2.4,
              0.55,
            );
          }
        }
      if (R.shake) this.kick(R.shake);
      if (R.glow) this.startGlow(this.glow, R.glow, R.glowPeak, flavor === 'osmotic' ? 380 : 300, 1);
    } else {
      const lq = this.liquid;
      lq.out = null;
      lq.top = VIS;
      lq.c.alpha = 1;
      lq.c.visible = true;
      this.drawLiquid();
      this.crest.tint = 0xffd6ea;
      this.crest.alpha = 0;
      this.crest.visible = true;
    }
  }

  onClearEnd() {
    for (const f of this.flashes) f.visible = false;
    if (this.L) for (const f of this.flashes) f.height = this.L.cell;
    const cycDone = this.anim?.kind === 'cyc';
    this.anim = null;
    // NS4-37: sıvı kendi zamanlayıcısıyla söner (anim yuvasında değil: sonraki temizleme onu yarıda bırakmasın)
    if (cycDone) this.liquid.out = 0;
    this.syncAll();
    if (cycDone) this.cycBoost();
  }

  /**
   * NS4-37: sıvının yüzeyi: iki dalganın toplamı, faz zamanla ilerler. Arka katman biraz daha yüksekte ve ters fazda
   * (derinlik); ön yüzeyde ince parlak çizgi. Maske ve çizgi her karede yeniden çizilir (yerleşim değişse de doğru).
   */
  drawLiquid() {
    const lq = this.liquid,
      c = this.L.cell,
      W = COLS * c,
      H = VIS * c,
      k = this.reducedMotion ? LIQUID_FX.reducedScale : 1;
    const top = lq.top * c,
      n = 48;
    const surf = (x: number, phase: number, lift: number) =>
      top -
      lift * c +
      Math.sin((x / W) * Math.PI * 2 * LIQUID_FX.waves + phase) * LIQUID_FX.amp * c * k +
      Math.sin((x / W) * Math.PI * 2 * LIQUID_FX.waves * 2.3 - phase * 1.7) * LIQUID_FX.amp2 * c * k;
    const shape = (g: PIXI.Graphics, phase: number, lift: number) => {
      g.clear();
      g.beginFill(0xffffff);
      g.moveTo(0, H);
      for (let i = 0; i <= n; i++) g.lineTo((i / n) * W, surf((i / n) * W, phase, lift));
      g.lineTo(W, H);
      g.closePath();
      g.endFill();
    };
    shape(lq.frontMask, lq.phase, 0);
    shape(lq.backMask, -lq.phase * 0.8 + 1.3, LIQUID_FX.backLift);
    // renk geçişi yüzeyin biraz üstünden tahtanın dibine
    const y0 = top - (LIQUID_FX.backLift + LIQUID_FX.amp + LIQUID_FX.amp2) * c;
    for (const s of [lq.back, lq.front]) {
      s.position.set(0, y0);
      s.width = W;
      s.height = Math.max(1, H - y0);
    }
    const ln = lq.line;
    ln.clear();
    ln.lineStyle({
      width: Math.max(1, LIQUID_FX.line * c),
      color: 0xffffff,
      alpha: LIQUID_FX.lineAlpha,
      cap: PIXI.LINE_CAP.ROUND,
    });
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * W,
        y = surf(x, lq.phase, 0);
      if (i) ln.lineTo(x, y);
      else ln.moveTo(x, y);
    }
  }

  /** NS4-37: sıvıyı ve tepe ışığını gizler (sönme bitti ya da yeni oyun). */
  hideLiquid() {
    const lq = this.liquid;
    lq.c.visible = false;
    lq.c.alpha = 1;
    lq.out = null;
    lq.top = VIS;
    this.crest.visible = false;
  }

  /** Sıklamen bitti, ×2 başladı: tek, yumuşak pembe vuruş ve alttan yükselen pembe/turkuaz kabarcıklar. */
  cycBoost() {
    const c = this.L.cell,
      dw = this.dropTex.orig.width;
    this.startGlow(this.glow, CYC_DONE.glow, CYC_DONE.peak, CYC_DONE.dur, 1);
    for (let i = 0, n = this.count(CYC_DONE.rise); i < n; i++)
      this.emitDrop(
        ((i + Math.random()) / n) * COLS * c,
        VIS * c - c * 0.3,
        CYC_TINTS[i % CYC_TINTS.length],
        (Math.random() - 0.5) * c * 0.8,
        -c * (6 + Math.random() * 4),
        560 + Math.random() * 240,
        c * 5,
        ((0.3 + Math.random() * 0.2) * c) / dw,
        1.5,
      );
  }

  /** NS4-24: hapşırık patlaması: sarsıntı, tek sıcak vuruş ve savrulan hücrelerden yukarı saçılan konfeti. */
  sneezeBurst(rows: readonly number[]) {
    const c = this.L.cell,
      dw = this.dropTex.orig.width,
      F = SNEEZE_FX;
    this.kick(F.shake);
    this.startGlow(this.glow, F.glow, F.glowPeak, 320, 1);
    for (const r of rows)
      for (let col = 0; col < COLS; col++) {
        if (!this.cells[r * COLS + col].visible) continue;
        for (let k = 0, n = this.count(F.confetti); k < n; k++)
          this.emitDrop(
            col * c + c / 2,
            r * c + c / 2,
            F.tints[(col + k) % F.tints.length],
            (col + 0.5 - COLS / 2) * c * (0.6 + Math.random() * 0.6),
            -c * (8 + Math.random() * 6),
            620 + Math.random() * 300,
            c * 22,
            ((0.22 + Math.random() * 0.16) * c) / dw,
            1.2,
            1.6,
            0.7,
          );
      }
  }

  /** NS4-27: "Sinüs açıldı": serin vuruş, hafif sarsıntı, alttan bütün genişlikte yükselen kabarcıklar. */
  onRoomClear() {
    if (!this.L) return;
    const c = this.L.cell,
      dw = this.dropTex.orig.width;
    this.startGlow(this.glow, ROOM_FX.glow, ROOM_FX.peak, ROOM_FX.dur, 1);
    this.kick(ROOM_FX.shake);
    for (let i = 0, n = this.count(ROOM_FX.bubbles); i < n; i++)
      this.emitDrop(
        ((i + Math.random()) / n) * COLS * c,
        VIS * c - c * 0.3,
        i % 3 === 2 ? 0xffffff : CYC_TINTS[i % CYC_TINTS.length],
        (Math.random() - 0.5) * c * 0.8,
        -c * (7 + Math.random() * 6),
        800 + Math.random() * 500,
        c * 4,
        ((0.3 + Math.random() * 0.25) * c) / dw,
        1.2,
      );
  }

  /**
   * NS4-22: büyük açılma anı (Tetris, Tam Ferahlık, oda açılışı): tahta kenarıyla birlikte parlar, serin turkuaz
   * parıltılar yukarı saçılır, sıklamen yaprakları yukarı süzülür. Satır temizlemesinde (Tetris / Tam Ferahlık)
   * temizlenen satırlardan, oda açılışında tahtanın altından doğar. Sürmekte olan ışımanın yerine geçer.
   */
  relief(kind: ReliefKind) {
    if (!this.L) return;
    const R = RELIEF_FX[kind],
      c = this.L.cell,
      dw = this.dropTex.orig.width;
    const rows = this.anim?.kind === 'lines' && this.anim.rows.length ? this.anim.rows : null;
    const y0 = rows ? (rows.reduce((a, b) => a + b, 0) / rows.length) * c + c / 2 : VIS * c - c * 0.5;
    this.startGlow(this.glow, R.glow, R.peak, R.dur, 1, R.edge);
    if (R.shake) this.kick(R.shake);
    for (let i = 0, n = this.count(R.sparkles); i < n; i++)
      this.emitDrop(
        ((i + Math.random()) / n) * COLS * c,
        y0 + (Math.random() - 0.5) * c,
        SPARKLE_TINTS[i % SPARKLE_TINTS.length],
        (Math.random() - 0.5) * c * 6,
        -c * (6 + Math.random() * 7),
        520 + Math.random() * 420,
        c * 6,
        ((0.16 + Math.random() * 0.14) * c) / dw,
        2.2,
      );
    for (let i = 0, n = this.count(R.petals); i < n; i++)
      this.spawnPetal(
        ((i + Math.random()) / n) * COLS * c,
        y0 + (Math.random() - 0.5) * c,
        (Math.random() - 0.5) * c * 5,
        -c * (4 + Math.random() * 5),
      );
  }

  onGameOver() {
    this.overT = 0;
    this.syncPiece();
    this.kick(0.8);
  }

  update(dt: number) {
    const g = this.game,
      L = this.L;
    if (!L) return;
    const c = L.cell;
    if (g.boardVer !== this.seen.board && !this.anim) this.syncBoard();
    if (g.pieceVer !== this.seen.piece || this.settings.ghost !== this.seen.ghost) this.syncPiece();
    if (g.queueVer !== this.seen.queue) this.syncQueue();

    // oturma yaylanması
    for (let i = this.bounce.length - 1; i >= 0; i--) {
      const b = this.bounce[i];
      b.t += dt;
      const p = Math.min(1, b.t / 140),
        k = 1 + Math.sin(p * Math.PI) * 0.09;
      const base = c / b.s.texture.orig.width;
      b.s.scale.set(base * k, base * (2 - k));
      if (p >= 1) {
        b.s.scale.set(base);
        this.bounce.splice(i, 1);
      }
    }

    // NS4-37: sıklamen sıvısı: yükselirken ve bitince sönerken dalgalanır; sönme anim yuvasından bağımsız
    const lq = this.liquid;
    if (lq.c.visible) {
      lq.phase += dt * LIQUID_FX.speed * (this.reducedMotion ? LIQUID_FX.reducedScale : 1);
      if (lq.out != null) {
        lq.out += dt;
        const q = Math.min(1, lq.out / LIQUID_FX.recedeMs);
        lq.c.alpha = 1 - q;
        this.crest.alpha = 0.4 * (1 - q) * this.motion.glow;
        if (q >= 1) this.hideLiquid();
      }
      if (lq.c.visible) this.drawLiquid();
    }

    // temizleme animasyonu
    const a = this.anim;
    const m = this.motion;
    if (a) {
      a.t += dt;
      if (a.kind === 'cyc') {
        const p = Math.min(1, a.t / a.dur),
          e = 1 - Math.pow(1 - p, 3);
        const top = a.rows.length ? Math.min(...a.rows) : VIS;
        const h = (VIS - top) * c * e + c * 0.6;
        // NS4-37: yüzey hücre cinsinden (yeniden yerleşimde doğru kalır); çizim aşağıda, sıvı adımında
        this.liquid.top = VIS - h / c;
        const surfaceY = this.liquid.top * c;
        // dalga tepesi: yüzeyin üstünde yumuşak pembe ışık
        this.crest.height = c * 0.32;
        this.crest.y = surfaceY - c * 0.2;
        this.crest.alpha = (0.45 - 0.2 * p) * m.glow;
        const dw = this.dropTex.orig.width;
        for (const r of a.rows)
          for (let col = 0; col < COLS; col++) {
            const i = r * COLS + col,
              s = this.cells[i];
            if (!s.visible) continue;
            if (s.y > surfaceY) {
              // sıvıya giren hücre bir kez çözünme parçacığı salar, sonra pembeleşerek erir ve hafifçe yükselir
              if (a.done && !a.done[i]) {
                a.done[i] = 1;
                for (let k = 0, n = this.count(2); k < n; k++)
                  this.emitDrop(
                    s.x + (Math.random() - 0.5) * c * 0.6,
                    s.y,
                    CYC_TINTS[(col + k) % CYC_TINTS.length],
                    (Math.random() - 0.5) * c * 0.8,
                    -c * (1.2 + Math.random() * 1.5),
                    520 + Math.random() * 300,
                    -c * 1.5,
                    ((0.3 + Math.random() * 0.2) * c) / dw,
                  );
              }
              s.alpha = Math.max(0, s.alpha - dt / 260);
              s.scale.set((c / s.texture.orig.width) * (0.6 + 0.4 * s.alpha));
              s.y -= dt * c * 0.0012;
              const q = 1 - s.alpha;
              s.tint = (255 << 16) | (Math.round(255 - 61 * q) << 8) | Math.round(255 - 31 * q);
            }
          }
        if (Math.random() < (dt / 16) * m.particles)
          this.emitDrop(
            Math.random() * COLS * c,
            VIS * c - Math.random() * h,
            0xffffff,
            (Math.random() - 0.5) * c,
            -c * (2 + Math.random() * 3),
            700,
            -c * 2,
            ((0.25 + Math.random() * 0.3) * c) / dw,
          );
      } else if (a.kind === 'room') {
        // NS4-27: kalan hücreler hafifçe yükselip söner; yeni oda geçiş sonunda (clearend → syncAll)
        const p = Math.min(1, a.t / a.dur),
          q = Math.max(0, (p - 0.25) / 0.75);
        for (let i = 0; i < this.cells.length; i++) {
          const s = this.cells[i];
          if (!s.visible) continue;
          const r = (i / COLS) | 0;
          s.alpha = 1 - q;
          s.y = r * c + c / 2 - q * c * 0.6;
        }
      } else if (a.kind === 'sneeze') {
        // NS4-24: "ha… ha…" (iki şişme) → "HAPŞU" (hücreler dönerek yukarı savrulur)
        const p = Math.min(1, a.t / a.dur),
          w = SNEEZE_FX.windup;
        if (p >= w && !a.burst) {
          a.burst = true;
          this.sneezeBurst(a.rows);
        }
        for (const r of a.rows)
          for (let col = 0; col < COLS; col++) {
            const s = this.cells[r * COLS + col];
            if (!s.visible) continue;
            const base = c / s.texture.orig.width;
            if (p < w) {
              const puff = Math.abs(Math.sin((p / w) * Math.PI * 2));
              s.scale.set(base * (1 + 0.1 * puff * m.shake));
              continue;
            }
            const q = (p - w) / (1 - w);
            s.scale.set(base * (1 - 0.35 * q));
            s.alpha = 1 - q;
            s.y = r * c + c / 2 - q * q * c * 7;
            s.x = col * c + c / 2 + (col + 0.5 - COLS / 2) * c * 0.35 * q;
            s.rotation = (col % 2 ? 1 : -1) * q * 1.4 * m.shake;
          }
      } else {
        const p = Math.min(1, a.t / a.dur),
          R = LINE_FX[a.flavor];
        for (let i = 0; i < a.rows.length; i++) {
          const f = this.flashes[i];
          let al = Math.max(0, 1 - p * 1.6);
          // Nörorefleks: hızlı titreşimli flaş (reduced motion'da düz sönüm)
          if (a.flavor === 'neuro' && m.flicker) al *= 0.6 + 0.4 * Math.cos(p * Math.PI * 8);
          f.alpha = al;
          const fh = c * (1 + R.bloom * p * (m.flicker ? 1 : 0.5));
          f.height = fh;
          f.y = a.rows[i] * c - (fh - c) / 2;
        }
        const k = 1 - Math.pow(p, 1.6);
        for (const r of a.rows)
          for (let col = 0; col < COLS; col++) {
            const s = this.cells[r * COLS + col];
            if (!s.visible) continue;
            const base = c / s.texture.orig.width;
            // NS4-27: gri bulutçuk gülümser ve süzülerek yukarı uçar (sıkışmaz)
            if (s.texture === this.tex[FACE_ID] || s.texture === this.happyTex) {
              s.texture = this.happyTex;
              s.scale.set((c / this.happyTex.orig.width) * (1 + 0.15 * p));
              s.alpha = 1 - p * p * p; // sona kadar görünür kalır
              s.y = r * c + c / 2 - p * c * 2.2;
              s.x = col * c + c / 2 + Math.sin(p * Math.PI * 2 + col) * c * 0.12;
              continue;
            }
            s.scale.set(base * Math.max(0.001, k), base * Math.max(0.001, k * 0.7));
            s.alpha = k;
            s.y = r * c + c / 2 + p * c * (a.flavor === 'osmotic' ? 0.2 : 0.35);
            // Ozmotik: hücreler zar boyunca tahtanın ortasına süzülür
            if (a.flavor === 'osmotic') s.x = col * c + c / 2 + (COLS / 2 - col - 0.5) * c * 0.18 * p;
          }
      }
    }

    // NS4-30: boşluk işaretleri nefes ritmiyle parlar
    this.holeT += dt;
    const ha = holeAlpha(this.holeT, this.reducedMotion);
    for (const h of this.holes) if (h.visible) h.alpha = this.overT >= 0 ? 0 : ha;
    // NS4-21: hava akışı; NS4-22: sıklamen yaprakları
    this.updateAir(dt);
    this.updatePetals(dt);

    // tahta ışıması ve satır bandı
    this.updateGlow(this.glow, dt);
    this.updateGlow(this.band, dt);

    // parçacıklar
    const sec = dt / 1000;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.alpha = 0;
        continue;
      }
      if (p.drag) {
        const d = Math.exp(-p.drag * sec);
        p.vx *= d;
        p.vy *= d;
      }
      p.vy += p.g * sec;
      p.s.x += p.vx * sec;
      p.s.y += p.vy * sec;
      const f = p.life / p.max;
      p.s.alpha = f;
      const sc = p.base * (0.5 + 0.5 * f); // life > 0 ise emitDrop base atamıştır
      p.s.scale.set(sc * p.sx, sc * p.sy);
    }

    // oyun sonu: yığını alttan yukarı griye çevir
    if (this.overT >= 0) {
      this.overT += dt;
      const n = Math.min(VIS, Math.floor(this.overT / 32));
      for (let r = VIS - 1; r >= VIS - n; r--)
        for (let col = 0; col < COLS; col++) {
          const s = this.cells[r * COLS + col];
          if (s.visible && s.texture !== this.tex[PIECE.GARBAGE]) {
            s.texture = this.tex[PIECE.GARBAGE];
            this.setPlant(s, 0, 0); // NS4-34: griye dönen yığında bitki yok
            s.alpha = 0.75;
          }
        }
    }

    // sarsıntı
    if (this.shake > 0.01) {
      this.shake *= Math.pow(0.0015, dt / 1000);
      const amp = this.shake * c * 0.18;
      this.boardC.position.set(L.board.x + (Math.random() - 0.5) * amp, L.board.y + Math.random() * amp);
    } else if (this.shake !== 0) {
      this.shake = 0;
      this.boardC.position.set(L.board.x, L.board.y);
    }
  }
}
