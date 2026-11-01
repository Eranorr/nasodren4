/* =====================================================================
   Yalnızca development: sıklamen çekirdeği gösterimi ve durumu
   (window.__fn.core). bootstrap bunu import.meta.env.DEV dalında dinamik
   olarak yükler; production paketine girmez. Storage'a yazmaz; mevcut
   oyunun tahtasını geçici bir düzenle değiştirir (oyun sürer).
   ===================================================================== */
import { COLS, ROWS } from '../config/gameConfig';
import type { Game } from '../game/Game';
import { PIECE } from '../game/pieces';
import { CORE, FLOW, collapseColumns, findCore, grayCellsInSpan } from '../game/cyclamenFlow';
import type { Lifecycle } from '../app/lifecycle';

export interface CoreState {
  /** Düşen parçanın çekirdeği (aday). */
  readonly candidateCore: boolean;
  /** Tahtada aktif çekirdek, hücresi (-1 yok), sabit hedef sırası, drenaj sütun aralığı ve kalan parça ömrü. */
  readonly activeCore: boolean;
  readonly coreRow: number;
  readonly coreColumn: number;
  readonly targetRow: number;
  readonly targetColumnRange: readonly [number, number] | null;
  readonly remainingPieces: number;
  readonly holdCore: boolean;
  readonly nextCore: boolean;
  readonly boardCores: number;
  /** Son drenajın sırası ve akan gri sayısı; son çökme tam sıra bıraktı mı. */
  readonly lastTargetRow: number;
  readonly drainedCells: number;
  readonly collapseCreatedFullRow: boolean;
  /** Oyun sayaçları. */
  readonly coresDealt: number;
  readonly coresArmed: number;
  readonly coresFizzled: number;
  readonly coresExpired: number;
  readonly flushes: number;
  readonly flushedCells: number;
  readonly collapsedCells: number;
  readonly collapseFullRows: number;
  readonly pending: string | null;
  /** Sıklamen gücü: kullanılabilir mi, kullanıldı mı, sonucu, ×2 kalan saniye. */
  readonly powerReady: boolean;
  readonly powerUsed: boolean;
  readonly powerResult: 'trigger' | 'seed' | null;
  readonly multSeconds: number;
}

export interface CoreDemo {
  /** Düşen parçaya çekirdek verir. */
  seedPiece(): CoreState;
  /**
   * Hazır tahtada çekirdekli yatay I'yı bırakır: çiçeği (9, 18) altındaki gri (9, 19) yakınlığı sağlar, I satırı
   * tamamlar ve çekirdeği tetikler; 19. sırada 7-9. sütunlardaki griler akar.
   */
  demoDrain(): CoreState;
  /**
   * Gri taban (18-21, 7. sütun kanal) üstünde renkli hücreler; 18. sırada 3. sütun ±FLOW.span içindeki griler akar,
   * ardından renkli hücreler sütunlarında iner. Öncesi ve sonrası koordinatlar ([x, y] tahta) döner.
   */
  demoCollapse(): {
    readonly before: readonly (readonly [number, number])[];
    readonly after: readonly (readonly [number, number])[];
  };
  /** Yeni oyun, %35 tıkanık tahtada aktif çekirdek; Sıklamen gücü: çekirdek hemen tetiklenir (±4, en çok 9 gri). */
  powerActiveCore(): CoreState;
  /** Yeni oyun, %35 tıkanık tahtada aktif çekirdek yok; Sıklamen gücü: sıradaki parça çekirdeklenir. */
  powerNoCore(): CoreState;
  state(): CoreState;
}

export function createCoreDemo(game: Game, lifecycle: Pick<Lifecycle, 'start' | 'getState'>): CoreDemo {
  function state(): CoreState {
    let boardCores = 0;
    for (let k = 0; k < game.plant.length; k++) if (game.board[k] && game.plant[k] & CORE) boardCores++;
    const core = game.coreLife > 0 ? findCore(game.board, game.plant) : -1;
    const active = core >= 0 && game.coreTargetRow >= 0;
    return {
      candidateCore: game.core,
      activeCore: core >= 0,
      coreRow: core >= 0 ? (core / COLS) | 0 : -1,
      coreColumn: core >= 0 ? core % COLS : -1,
      targetRow: active ? game.coreTargetRow : -1,
      targetColumnRange: active
        ? [Math.max(0, game.coreTargetCol - FLOW.span), Math.min(COLS - 1, game.coreTargetCol + FLOW.span)]
        : null,
      remainingPieces: core >= 0 ? game.coreLife : 0,
      holdCore: game.holdCore,
      nextCore: game.queueCore[0] === true,
      boardCores,
      lastTargetRow: game.flushRow,
      drainedCells: game.lastFlush,
      collapseCreatedFullRow: game.lastCollapseFull,
      coresDealt: game.coresDealt,
      coresArmed: game.coresArmed,
      coresFizzled: game.coresFizzled,
      coresExpired: game.coresExpired,
      flushes: game.flushes,
      flushedCells: game.flushedCells,
      collapsedCells: game.collapsedCells,
      collapseFullRows: game.collapseFullRows,
      pending: game.pending?.kind ?? null,
      powerReady: game.canCyc(),
      powerUsed: game.cycUsed,
      powerResult: game.cycSupport,
      multSeconds: Math.ceil(game.multT / 1000),
    };
  }
  const ensurePlaying = () => {
    if (lifecycle.getState() !== 'playing') lifecycle.start();
  };
  /** Yeni oyun (Sıklamen gücü kullanılmamış) ve 15-21. sıralar gri (9. sütun kanal): tıkanıklık %35. */
  const congested = () => {
    lifecycle.start();
    game.board.fill(0);
    game.plant.fill(0);
    game.coreLife = 0;
    game.coreTargetRow = -1;
    for (let y = ROWS - 7; y < ROWS; y++) for (let x = 0; x < COLS - 1; x++) game.board[y * COLS + x] = PIECE.GARBAGE;
    game.boardVer++;
  };
  return {
    seedPiece() {
      if (game.type && game.state === 'play') {
        game.core = true;
        game.pieceVer++;
      }
      return state();
    },
    demoDrain() {
      ensurePlaying();
      if (game.state !== 'play') return state();
      const y = ROWS - 4;
      game.board.fill(0);
      game.plant.fill(0);
      game.coreLife = 0;
      game.coreTargetRow = -1;
      for (let r = ROWS - 3; r < ROWS; r++) for (let x = 1; x < COLS; x++) game.board[r * COLS + x] = PIECE.GARBAGE;
      for (let x = 0; x < 6; x++) game.board[y * COLS + x] = PIECE.J;
      game.boardVer++;
      game.type = PIECE.I;
      game.rot = 0;
      game.x = 6;
      game.y = y - 1; // I'nın hücreleri şeklin 1. sırasında: doğrudan y sırasına
      game.core = true;
      game.pieceVer++;
      game.hardDrop();
      return state();
    },
    demoCollapse() {
      ensurePlaying();
      const B = game.board,
        P = game.plant;
      B.fill(0);
      P.fill(0);
      game.coreLife = 0;
      game.coreTargetRow = -1;
      for (let y = ROWS - 4; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (x !== 7) B[y * COLS + x] = PIECE.GARBAGE;
      // 18. sıranın üstünde: 2-4. sütunlarda T, 8-9. sütunlarda iki katlı O (hepsi 18'deki grilere dayanır)
      for (const [x, y, t] of [
        [3, 16, PIECE.T],
        [2, 17, PIECE.T],
        [3, 17, PIECE.T],
        [4, 17, PIECE.T],
        [8, 16, PIECE.O],
        [9, 16, PIECE.O],
        [8, 17, PIECE.O],
        [9, 17, PIECE.O],
      ] as const)
        B[y * COLS + x] = t;
      game.boardVer++;
      const colored = (b: Uint8Array) => {
        const out: [number, number][] = [];
        for (let k = 0; k < b.length; k++) if (b[k] && b[k] !== PIECE.GARBAGE) out.push([k % COLS, (k / COLS) | 0]);
        return out;
      };
      const before = colored(B);
      const cells = grayCellsInSpan(B, ROWS - 4, 3, FLOW.span);
      // sonrası: aynı kural bir kopyada (oyun tahtası drenaj ve çökme evreleriyle değişir)
      const b2 = B.slice(),
        p2 = P.slice();
      for (const k of cells) b2[k] = 0;
      collapseColumns(b2, p2, new Set(cells.map((k) => k % COLS)));
      // drenaj evresini başlat (aktif parça yok); bitince çökme evresi, sonra yeni parça
      game.type = 0;
      game.core = false;
      game.pieceVer++;
      const p = { kind: 'flush', rows: [], cells } as const;
      game.flushRow = ROWS - 4;
      game.flushCol = 3;
      game.lastFlush = cells.length;
      game.state = 'draining';
      game.stateT = FLOW.rowMs;
      game.pending = p;
      game.emit('clearstart', p);
      return { before, after: colored(b2) };
    },
    powerActiveCore() {
      congested();
      // çekirdekli T 3-5. sütunlara iner: çiçek (4, 13), gri (4, 15) 2 sıra altta → aktif, hedef 15 (±4: 0-8)
      game.type = PIECE.T;
      game.rot = 0;
      game.x = 3;
      game.y = 0;
      game.core = true;
      game.pieceVer++;
      game.hardDrop();
      game.useCyc();
      return state();
    },
    powerNoCore() {
      congested();
      game.queueCore.fill(false);
      game.queueVer++;
      game.useCyc();
      return state();
    },
    state,
  };
}
