// localStorage şemaları. Alan adları fn_settings / fn_meta JSON'unun parçasıdır; değiştirilmemelidir.
// NS4-06: kayıtlı değerler yüklenirken storage/settings.ts ve storage/progress.ts içinde doğrulanır.
import type { BadgeId } from './content';

/** fn_settings */
export interface Settings {
  sound: boolean;
  music: boolean;
  /** NS4-39: ana menü ve mola müziği (music kapalıysa çalmaz). */
  menuMusic: boolean;
  /** NS4-39: müzik ve efekt ses düzeyi (0..100). */
  musicVol: number;
  sfxVol: number;
  haptics: boolean;
  ghost: boolean;
  fps: boolean;
  /** Basılı tutunca kayma gecikmesi (ms, 50..300). */
  das: number;
  /** Kayma tekrar hızı (ms, 0..100; 0 = anında duvara). */
  arr: number;
}

export type BooleanSettingKey = 'sound' | 'music' | 'menuMusic' | 'haptics' | 'ghost' | 'fps';
export type NumericSettingKey = 'musicVol' | 'sfxVol' | 'das' | 'arr';

/**
 * fn_meta: yalnızca cihazdaki yerel ilerleme (yerel rekor, toplam drenaj, rozetler).
 * `badges` yalnızca bilinen, tekrarsız rozet kimlikleridir (yüklemede doğrulanır).
 */
export interface Meta {
  best: number;
  totalLines: number;
  badges: BadgeId[];
}
