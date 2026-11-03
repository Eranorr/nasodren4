/* =====================================================================
   Geliştirme araçları: Sinüzit Atağı ve Spray (__fn.sinus). Yalnızca
   development build'de bootstrap'ın DEV dalında dinamik olarak yüklenir;
   production paketinde yok. Oyun oynanmıyorsa önce başlatılır.
   ===================================================================== */
import type { Game } from '../game/Game';
import type { Lifecycle } from '../app/lifecycle';
import { COLS, ROWS } from '../config/gameConfig';
import { ORIGIN, SINUS } from '../game/sinusAttack';

export interface SinusState {
  /** Atak barı (0..1), atak sayısı, tahtadaki atak ve oda grisi, oda hedefinde kalan. */
  readonly attackProgress: number;
  readonly attacks: number;
  readonly attackGray: number;
  readonly roomGray: number;
  /** Spray şarjı, eşiği, hazır mı, dolu ama hedefsiz mi, kullanım sayısı. */
  readonly sprayCharge: number;
  readonly sprayThreshold: number;
  readonly sprayReady: boolean;
  readonly sprayNoTarget: boolean;
  readonly sprays: number;
  /** Puansız silinen atak satırı ve oda geçişinde taşınan atak grisi. */
  readonly attackLines: number;
  readonly carriedAttackGray: number;
}

export interface SinusDemo {
  /** Atağı hemen tetikler (bar sıfırlanır). */
  attack(): SinusState;
  /** Barı verilen orana getirir (0..0,999; atak tetiklenmez). */
  setProgress(p: number): SinusState;
  /** Spray şarjını doldurur. */
  fillSpray(): SinusState;
  /** Kaynak katmanı: sıra başına bir dize ('.' boş/renkli, 'o' oda grisi, 'a' atak grisi). */
  origin(): string[];
  state(): SinusState;
}

export function createSinusDemo(game: Game, lifecycle: Lifecycle): SinusDemo {
  const ensure = () => {
    if (lifecycle.getState() !== 'playing') lifecycle.start();
  };
  const state = (): SinusState => ({
    attackProgress: Math.round((game.attackT / SINUS.attackMs) * 1000) / 1000,
    attacks: game.attacks,
    attackGray: game.attackGrayCount(),
    roomGray: game.roomGray,
    sprayCharge: game.sprayCharge,
    sprayThreshold: SINUS.sprayThreshold,
    sprayReady: game.canSpray(),
    sprayNoTarget: game.sprayNoTarget(),
    sprays: game.sprays,
    attackLines: game.attackLines,
    carriedAttackGray: game.carriedAttackGray,
  });
  return {
    attack() {
      ensure();
      game.attackT = 0;
      game.sinusAttack();
      return state();
    },
    setProgress(p) {
      ensure();
      game.attackT = Math.max(0, Math.min(0.999, p)) * SINUS.attackMs;
      return state();
    },
    fillSpray() {
      ensure();
      game.sprayCharge = SINUS.sprayThreshold;
      return state();
    },
    origin() {
      const out: string[] = [];
      for (let y = 0; y < ROWS; y++) {
        let r = '';
        for (let x = 0; x < COLS; x++) {
          const o = game.origin[y * COLS + x];
          r += o === ORIGIN.room ? 'o' : o === ORIGIN.attack ? 'a' : '.';
        }
        out.push(r);
      }
      return out;
    },
    state,
  };
}
