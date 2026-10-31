/* =====================================================================
   Yalnızca development: gri bulutçuk teması gösterimi (window.__fn.collisionDemo).
   bootstrap bunu import.meta.env.DEV dalında dinamik olarak yükler; production
   paketine girmez. Storage'a yazmaz; mevcut oyunun tahtasını geçici bir
   düzenle değiştirir (oyun sürer). Dönen değer tahta ve çizim koordinatlarıdır.
   ===================================================================== */
import { COLS, HIDDEN, ROWS } from '../config/gameConfig';
import type { Game } from '../game/Game';
import { PIECE } from '../game/pieces';
import type { View } from '../rendering/GameView';
import type { Lifecycle } from '../app/lifecycle';

export interface ContactReport {
  /** Gri hücrelerin en üst tahta sırası ve çizildiği görünür sıra (sprite merkezi / hücre). */
  readonly grayRow: number;
  readonly grayDrawnRow: number;
  /** Aktif parçanın ghost sırası (hard drop'un biteceği y). */
  readonly ghostY: number;
  /** Hard drop yapıldıysa kilitlenen hücreler (tahta [x, y]), çizildikleri görünür sıralar ve griyle arada boşluk var mı. */
  readonly locked: readonly (readonly [number, number])[];
  readonly lockedDrawnRows: readonly number[];
  readonly gap: boolean | null;
}

export interface CollisionDemo {
  /** Altta gri bulutçuklar (19-21. sıralar, 7. sütun kanal) ve üstünde O; `drop`: hemen hard drop. */
  grayContact(drop?: boolean): ContactReport;
}

export function createCollisionDemo(
  game: Game,
  view: View,
  lifecycle: Pick<Lifecycle, 'start' | 'getState'>,
): CollisionDemo {
  const drawnRow = (k: number) => {
    const s = view.cells[(((k / COLS) | 0) - HIDDEN) * COLS + (k % COLS)],
      c = view.L.cell;
    return s?.visible ? Math.round(((s.y - c / 2) / c) * 1000) / 1000 : -1;
  };
  return {
    grayContact(drop = false) {
      if (lifecycle.getState() !== 'playing') lifecycle.start();
      game.board.fill(0);
      game.plant.fill(0);
      game.coreLife = 0;
      for (let y = ROWS - 3; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) if (x !== 7) game.board[y * COLS + x] = PIECE.GARBAGE;
      game.boardVer++;
      game.type = PIECE.O;
      game.rot = 0;
      game.x = 3;
      game.y = 1;
      game.core = false;
      game.lockT = 0;
      game.gAcc = 0;
      game.pieceVer++;
      view.syncAll();
      const grayTop = (ROWS - 3) * COLS + 4;
      const ghostY = game.ghostY();
      let locked: number[] = [];
      if (drop) {
        const off = game.on('lock', (c) => {
          locked = [...c];
        });
        game.hardDrop();
        off();
        view.syncAll();
      }
      const lowest = locked.length ? Math.max(...locked.map((k) => (k / COLS) | 0)) : -1;
      return {
        grayRow: ROWS - 3,
        grayDrawnRow: drawnRow(grayTop),
        ghostY,
        locked: locked.map((k) => [k % COLS, (k / COLS) | 0] as const),
        lockedDrawnRows: locked.map(drawnRow),
        gap: locked.length ? lowest + 1 !== ROWS - 3 : null,
      };
    },
  };
}
