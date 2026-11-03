/* =====================================================================
   Sinüzit Atağı barı ve Spray düğmesi (docs/SINUS-ATTACK-AND-SPRAY-FINAL.md).
   Yalnızca değişen değerler DOM'a yazılır. Yeni metin yok: düğme adı
   yalnızca "Spray"; bar ekran okuyucuya "Sinüzit Atağı" ilerleme çubuğu.
   ===================================================================== */
import { $, place } from './dom';
import type { Game } from '../game/Game';
import type { Layout } from '../types/layout';
import { SINUS } from '../game/sinusAttack';

/** Bar bu orandan sonra uyarı nabzı atar. */
export const ATTACK_WARN = 0.75;
/** Atak anı parlamasının süresi (ms). */
export const ATTACK_HIT_MS = 450;

export interface SinusHud {
  layout(L: Layout): void;
  sync(g: Game, playing: boolean): void;
  /** Atak tetiklendi: kısa parlama. */
  onAttack(): void;
  reset(): void;
}

export function createSinusHud(): SinusHud {
  const bar = $('attack-bar'),
    fill = $('attack-fill'),
    btn = $('btn-spray', HTMLButtonElement),
    sfill = $('spray-fill');
  let vertical = false,
    lastP = -1,
    lastAria = -1,
    lastS = -1,
    lastReady: boolean | null = null,
    lastIdle: boolean | null = null,
    lastWarn: boolean | null = null,
    hitTimer: ReturnType<typeof setTimeout> | undefined;
  const reset = () => {
    lastP = lastS = lastAria = -1;
    lastReady = lastIdle = lastWarn = null;
    clearTimeout(hitTimer);
    bar.classList.remove('hit', 'warn');
  };
  return {
    layout(L) {
      place(bar, L.attackBar);
      vertical = L.attackBar.h > L.attackBar.w;
      bar.classList.toggle('v', vertical);
      place(btn, L.btnSpray);
      btn.classList.toggle('compact-btn', L.compactBtns);
      lastP = -1;
    },
    sync(g, playing) {
      const p = Math.round(Math.min(1, g.attackT / SINUS.attackMs) * 200) / 200;
      if (p !== lastP) {
        lastP = p;
        fill.style.transform = vertical ? `scaleY(${p})` : `scaleX(${p})`;
      }
      // ekran okuyucu: ilerleme %10 adımlarla (her karede duyuru yok)
      const aria = Math.floor(p * 10) * 10;
      if (aria !== lastAria) {
        lastAria = aria;
        bar.setAttribute('aria-valuenow', String(aria));
      }
      const warn = playing && p >= ATTACK_WARN;
      if (warn !== lastWarn) {
        lastWarn = warn;
        bar.classList.toggle('warn', warn);
      }
      const s = Math.min(1, g.sprayCharge / SINUS.sprayThreshold);
      if (s !== lastS) {
        lastS = s;
        sfill.style.transform = `scaleX(${s})`;
      }
      const ready = playing && g.canSpray();
      if (ready !== lastReady) {
        lastReady = ready;
        btn.disabled = !ready;
        btn.classList.toggle('ready', ready);
      }
      // şarj dolu ama atak grisi yok: düğme kapalı, dolum çizgili sönük görünür (metin yok)
      const idle = playing && g.sprayNoTarget();
      if (idle !== lastIdle) {
        lastIdle = idle;
        btn.classList.toggle('idle', idle);
      }
    },
    onAttack() {
      bar.classList.add('hit');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => bar.classList.remove('hit'), ATTACK_HIT_MS);
    },
    reset,
  };
}
