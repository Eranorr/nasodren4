/* =====================================================================
   NS4-16: yalnızca development yardımcı ekran gösterimi (window.__fn.ui).
   Production paketine girmez: bootstrap bunu import.meta.env.DEV dalında
   dinamik olarak yükler. Storage'a yazmaz: oyun sonu örneği gerçek
   handleGameOver akışını (rekor, toplam drenaj, rozet, analitik) çalıştırmaz,
   yalnızca ekranı örnek değerlerle çizer.
   ===================================================================== */
import { BADGE_IDS } from '../content/badges';
import { openSub, renderGameOver } from '../ui/screens';
import { hideRoomMap, showRoomMap } from '../ui/sinusMap';
import { CFG, ROOMS } from '../config/gameConfig';
import type { Lifecycle } from '../app/lifecycle';
import type { Game } from '../game/Game';
import type { BadgeId } from '../types/content';

export interface OverDemoOptions {
  /** Yeni rekor rozeti (varsayılan true). */
  readonly best?: boolean;
  /** Rozet örneği: 'mixed' (yeni + kazanılmış + kilitli, varsayılan), 'none' (hepsi kilitli), 'all'. */
  readonly badges?: 'mixed' | 'none' | 'all';
}

export interface ScreensDemo {
  /** Mola ekranı (menüdeyse önce oyun başlatılır). */
  pause(): void;
  /** Ayarlar (açık ekranın alt ekranı olarak; geri dönüş açan ekrana). */
  settings(): void;
  /** Nasıl oynanır. */
  how(): void;
  /** Oyun sonu örneği (storage'a yazmadan). */
  over(opts?: OverDemoOptions): void;
  /** NS4-31: oda açılış kartı (0 tabanlı oda; geçiş süresi kadar görünür, oyun durumuna dokunmaz). */
  roomMap(room?: number): void;
  /** NS4-31: final ekranı (oyun Serbest nefese geçer; menüdeyse önce oyun başlatılır). */
  final(): void;
}

export function createScreensDemo(lifecycle: Pick<Lifecycle, 'getState' | 'start' | 'pause'>, game: Game): ScreensDemo {
  const pause = () => {
    if (lifecycle.getState() === 'menu') lifecycle.start();
    if (lifecycle.getState() === 'playing') lifecycle.pause();
  };
  return {
    pause,
    roomMap: (room = 0) => {
      showRoomMap(room, 1000 * (room + 1));
      setTimeout(hideRoomMap, CFG.roomClearMs);
    },
    final: () => {
      if (lifecycle.getState() === 'menu') lifecycle.start();
      if (lifecycle.getState() === 'playing') game.enterRoom(ROOMS.length); // roomstart → final ekranı
    },
    settings: () => openSub('scr-set'),
    how: () => openSub('scr-how'),
    over: ({ best = true, badges = 'mixed' } = {}) => {
      if (lifecycle.getState() === 'playing') lifecycle.pause(); // oyun overlay arkasında ilerlemesin
      const ids: readonly BadgeId[] = BADGE_IDS;
      const earned = badges === 'all' ? ids : badges === 'none' ? [] : ids.slice(0, 3);
      const fresh = badges === 'mixed' ? ids.slice(0, 1) : [];
      renderGameOver({
        score: Math.max(game.score, 5600),
        lines: Math.max(game.lines, 23),
        best: best ? Math.max(game.score, 5600) : 9800,
        isBest: best,
        badges: { earned, fresh },
      });
    },
  };
}
