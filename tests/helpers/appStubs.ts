// NS4-06/07: createLifecycle ve wireGameEvents için en küçük View/Sound/Pixi taklitleri. Render veya ses
// üretilmez. Tanımlı olmayan her yöntem çağrısı `calls` dizisine yazılan boş bir fonksiyondur.
import type * as PIXI from 'pixi.js';
import type { LifecycleDeps } from '../../src/app/lifecycle';
import type { Sound } from '../../src/audio/SoundManager';
import type { Game } from '../../src/game/Game';
import type { View } from '../../src/rendering/GameView';

export interface AppStubs {
  readonly deps: LifecycleDeps;
  readonly calls: string[];
}

/** Bilinen alanlar dışında her özelliği kayıt tutan boş bir fonksiyon olarak döndürür. */
function recorder<T extends object>(name: string, base: T, calls: string[]): T {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop in target) return Reflect.get(target, prop, receiver) as unknown;
      return () => {
        calls.push(`${name}.${prop}`);
      };
    },
  });
}

/** `rooms`: NS4-27 oda akışı. Varsayılan kapalı: NS4-27 öncesi testler boş tahtayla başlar. */
export function createAppStubs(game: Game, rooms = false): AppStubs {
  const calls: string[] = [];
  const view = recorder('view', { overT: -1, anim: null, wave: null, flashes: [], shake: 0 }, calls);
  const sound = recorder('sound', {}, calls);
  const app = { ticker: recorder('ticker', {}, calls) };
  return {
    calls,
    deps: {
      game,
      view: view as unknown as View,
      sound: sound as unknown as Sound,
      app: app as unknown as PIXI.Application<HTMLCanvasElement>,
      buzz: () => {
        calls.push('buzz');
      },
      resetInput: () => {
        calls.push('resetInput');
      },
      rooms,
    },
  };
}
