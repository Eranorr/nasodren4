/* =====================================================================
   NS4-15: yalnızca development efekt gösterimi (window.__fn.fx). Production
   paketine girmez: bootstrap bunu import.meta.env.DEV dalında dinamik olarak
   yükler. Skor, istatistik, rozet veya storage'a yazmaz; mekanik çalışmaz.
   Tahtanın alt satırları geçici olarak doldurulur, efekt bitince eski tahta
   geri yazılır. Oyunu duraklatıp (Esc / P) kullanın.
   ===================================================================== */
import { CFG, COLS, ROWS } from '../config/gameConfig';
import type { Game } from '../game/Game';
import type { View } from '../rendering/GameView';
import type { PendingClearKind } from '../types/game';
import type { ReliefKind } from '../rendering/effects';
import { reliefFlash } from '../ui/hud';

export interface FxDemo {
  drain(n?: 1 | 2 | 3): void;
  tetris(): void;
  tspin(n?: 0 | 1 | 2 | 3): void;
  cyc(): void;
  sneeze(): void;
  /** NS4-22: büyük açılma anı (Tetris / Tam Ferahlık: dört satır temizlemesiyle; oda: "Sinüs açıldı" kutlamasıyla). */
  relief(kind?: ReliefKind): void;
  /** Reduced motion önizlemesi (yalnızca bu oturum; işletim sistemi tercihine dönmek için sayfayı yenileyin). */
  reduced(on?: boolean): boolean;
  /** Bütün efektleri sırayla gösterir. */
  all(): void;
}

export function createFxDemo(view: View, game: Game): FxDemo {
  const rowsFrom = (n: number) => Array.from({ length: n }, (_, i) => ROWS - n + i);
  const busy = () => view.anim !== null;

  /** Satırları doldurur, efekti başlatır, süre sonunda eski tahtayı geri yazar ve clearend'i taklit eder. */
  function run(kind: PendingClearKind, rows: number[], before?: () => void) {
    if (busy()) return;
    const snapshot = game.board.slice();
    for (const y of rows) for (let x = 0; x < COLS; x++) game.board[y * COLS + x] = 1 + ((x + y) % 7);
    game.boardVer++;
    view.syncBoard();
    before?.();
    view.onClearStart({ kind, rows });
    const dur = kind === 'cyc' ? CFG.drainMs : kind === 'sneeze' ? CFG.sneezeMs : CFG.lineClearMs;
    setTimeout(() => {
      game.board.set(snapshot);
      game.boardVer++;
      view.onClearEnd();
    }, dur);
  }

  /** Alt satırlarda T biçimli kilit (T-spin kıvılcımlarının çıkış noktası). */
  function lockT() {
    const y = ROWS - 2,
      x = 4;
    view.lastLock = [y * COLS + x - 1, y * COLS + x, y * COLS + x + 1, (y + 1) * COLS + x];
  }

  const demo: FxDemo = {
    drain: (n = 1) =>
      run('lines', rowsFrom(n), () => {
        view.onScored({ n, tspin: 0 });
      }),
    tetris: () =>
      run('lines', rowsFrom(4), () => {
        view.onScored({ n: 4, tspin: 0 });
      }),
    tspin: (n = 2) => {
      lockT();
      if (n === 0) view.onScored({ n: 0, tspin: 2 });
      else
        run('lines', rowsFrom(n), () => {
          view.onScored({ n, tspin: 2 });
        });
    },
    cyc: () => run('cyc', rowsFrom(10)),
    sneeze: () => run('sneeze', rowsFrom(3)),
    relief: (kind = 'allclear') => {
      if (busy()) return;
      if (kind === 'room') view.onRoomClear();
      else run('lines', rowsFrom(4), () => view.onScored({ n: 4, tspin: 0 }));
      view.relief(kind);
      reliefFlash(kind);
    },
    reduced: (on) => {
      if (on !== undefined) view.reducedMotion = on;
      return view.reducedMotion;
    },
    all: () => {
      const seq: (() => void)[] = [
        () => demo.drain(1),
        () => demo.drain(3),
        () => demo.tetris(),
        () => demo.tspin(0),
        () => demo.tspin(2),
        () => demo.sneeze(),
        () => demo.cyc(),
        () => demo.relief('tetris'),
        () => demo.relief('room'),
        () => demo.relief('allclear'),
      ];
      seq.forEach((f, i) => setTimeout(f, i * 1400));
    },
  };
  return demo;
}
