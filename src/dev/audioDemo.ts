/* =====================================================================
   NS4-17: yalnızca development ses/haptik gösterimi (window.__fn.sfx).
   Production paketine girmez: bootstrap bunu import.meta.env.DEV dalında
   dinamik olarak yükler. Storage'a yazmaz, oyun durumunu değiştirmez.
   Hiçbir şeyi kendiliğinden başlatmaz: AudioContext ancak kullanıcı
   etkileşimiyle açılmışsa ses, sayfa etkileşim almışsa titreşim çalar.
   Ses ve titreşim oyundaki ayarlara uyar (kapalıysa çalmaz).
   ===================================================================== */
import type { Sound } from '../audio/SoundManager';
import { HAPTIC, type Buzz } from '../haptics/haptics';

export const DEMO_SOUNDS = [
  'move',
  'rotate',
  'hold',
  'lock',
  'hard',
  'drain1',
  'drain2',
  'drain3',
  'tetris',
  'tspin',
  'tspin0',
  'cyc',
  'sneeze',
  'level',
  'over',
] as const;
export type DemoSound = (typeof DEMO_SOUNDS)[number];
export const DEMO_HAPTICS = ['lock', 'hard', 'drain1', 'drain2', 'drain3', 'tetris', 'cyc', 'sneeze', 'over'] as const;
export type DemoHaptic = (typeof DEMO_HAPTICS)[number];

export interface AudioDemoState {
  readonly context: string;
  readonly unlocked: boolean;
  readonly unsupported: boolean;
  readonly musicOn: boolean;
  readonly musicSources: number;
}

export interface AudioDemo {
  /** Tek ses (AudioContext kullanıcı etkileşimiyle açılmamışsa çalmaz). */
  play(name: DemoSound): string;
  /** Bütün sesler sırayla (yaklaşık 1 sn arayla). */
  all(): string;
  /** Tek titreşim deseni (sayfa henüz etkileşim almadıysa veya ayar kapalıysa titreşmez). */
  haptic(name: DemoHaptic): string;
  state(): AudioDemoState;
}

const NEED_GESTURE = 'Önce sayfaya tıklayın veya bir tuşa basın (ses yalnızca kullanıcı etkileşiminden sonra açılır).';

export function createAudioDemo(sound: Sound, buzz: Buzz): AudioDemo {
  const run: Record<DemoSound, () => void> = {
    move: () => sound.move(),
    rotate: () => sound.rotate(),
    hold: () => sound.hold(),
    lock: () => sound.lock(),
    hard: () => sound.hard(),
    drain1: () => sound.clear(1, 0),
    drain2: () => sound.clear(2, 0),
    drain3: () => sound.clear(3, 0),
    tetris: () => sound.clear(4, 0),
    tspin: () => sound.clear(2, 2),
    tspin0: () => sound.clear(0, 2),
    cyc: () => sound.cyc(),
    sneeze: () => sound.sneeze(),
    level: () => sound.level(),
    over: () => sound.over(),
  };
  const pattern: Record<DemoHaptic, VibratePattern> = {
    lock: HAPTIC.lock,
    hard: HAPTIC.hard,
    drain1: HAPTIC.clear(1),
    drain2: HAPTIC.clear(2),
    drain3: HAPTIC.clear(3),
    tetris: HAPTIC.clear(4),
    cyc: HAPTIC.cyc,
    sneeze: HAPTIC.sneeze,
    over: HAPTIC.over,
  };
  const ready = () => sound.unlocked && sound.contextState === 'running';
  return {
    play(name) {
      if (!ready()) return NEED_GESTURE;
      run[name]();
      return name;
    },
    all() {
      if (!ready()) return NEED_GESTURE;
      DEMO_SOUNDS.forEach((n, i) => setTimeout(() => run[n](), i * 1000));
      return `${DEMO_SOUNDS.length} ses, ~${DEMO_SOUNDS.length} sn`;
    },
    haptic(name) {
      const active = (navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
      if (active === false) return NEED_GESTURE;
      buzz(pattern[name]);
      return name;
    },
    state: () => ({
      context: sound.contextState,
      unlocked: sound.unlocked,
      unsupported: sound.unsupported,
      musicOn: sound.musicOn,
      musicSources: sound.musicSourceCount,
    }),
  };
}
