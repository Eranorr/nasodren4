// Tarayıcı global'leri için dar kapsamlı tip genişletmesi (çalışma anı kodu yok).
import type * as PIXI from 'pixi.js';
import type { Game } from '../game/Game';
import type { View } from '../rendering/GameView';
import type { FxDemo } from '../dev/fxDemo';
import type { ScreensDemo } from '../dev/screensDemo';
import type { AudioDemo } from '../dev/audioDemo';
import type { CoreDemo } from '../dev/coreDemo';
import type { CollisionDemo } from '../dev/collisionDemo';
import type { SinusDemo } from '../dev/sinusDemo';

declare global {
  interface Window {
    /** Yalnızca development build'de atanır (bkz. app/bootstrap.ts). */
    __fn?: {
      game: Game;
      view: View;
      app: PIXI.Application<HTMLCanvasElement>;
      fx?: FxDemo;
      ui?: ScreensDemo;
      sfx?: AudioDemo;
      /** Sıklamen çekirdeği gösterimi ve durumu. */
      core?: CoreDemo;
      /** Gri bulutçuk teması gösterimi. */
      collisionDemo?: CollisionDemo;
      /** Sinüzit Atağı ve Spray: atağı tetikle, Spray'i doldur, kaynak katmanını incele. */
      sinus?: SinusDemo;
    };
    /**
     * Etiket yöneticisi (ör. GTM) kuyruğu. Sayfaya dışarıdan eklenir; öğeleri bu kodun kontrolünde
     * olmadığı için `unknown[]` olarak modellenir. track() yalnızca Array.isArray sonrası push eder.
     */
    dataLayer?: unknown[];
    /** Eski Safari için önekli AudioContext. */
    webkitAudioContext?: typeof AudioContext;
  }
}

export {};
