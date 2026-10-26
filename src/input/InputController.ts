/* =====================================================================
   INPUT: klavye (DAS/ARR) + dokunmatik jestler + HUD butonları + otomatik mola
   NS4-03: main.ts'ten taşındı. Klavye tuşları ve DAS/ARR değişmedi.
   NS4-13: dokunmatik jest kuralları input/gestures.ts'e taşındı (dokunma
   toleransı, fırlatma eşikleri, tek parmak, tahta dışı başlangıç, iptaller).
   Bağımlılıklar açıkça verilir; dispose() bağlanan bütün dinleyicileri kaldırır.
   ===================================================================== */
import { $, listen, type Off } from '../ui/dom';
import type { Game } from '../game/Game';
import type { AppState } from '../types/app';
import type { Step } from '../types/game';
import type { Rect } from '../types/layout';
import type { Settings } from '../types/settings';
import { GestureTracker } from './gestures';

export interface InputDeps {
  readonly game: Game;
  /** Pixi canvas'ı (jestler yalnızca bunun üzerinde dinlenir). */
  readonly canvas: HTMLCanvasElement;
  readonly settings: Readonly<Pick<Settings, 'das' | 'arr'>>;
  /** Uygulama durumunu okur (her olayda güncel değer). */
  readonly getState: () => AppState;
  /** Güncel layout hücre boyutu (px). */
  readonly getCell: () => number;
  readonly pause: () => void;
  readonly resume: () => void;
  /** Açık alt ekranı (Ayarlar, Nasıl oynanır) kapatır; kapattıysa true döner. */
  readonly closeSub: () => boolean;
  readonly unlockAudio: () => void;
  /** NS4-12: yavaş indirme yapıldığında (↓ tuşu veya aşağı sürüklemeyle inen satır). İsteğe bağlı. */
  readonly onSoftDrop?: () => void;
  /** NS4-12: son kullanılan giriş tipi (klavye tuşu / dokunmatik). İsteğe bağlı. */
  readonly onInputMode?: (mode: 'keyboard' | 'touch') => void;
  /** NS4-13: tahta dikdörtgeni (sahne koordinatları). Verilirse jest yalnızca tahta üzerinde (± yarım hücre) başlar. */
  readonly getBoard?: () => Rect;
}

/** Basılı yön: -1 sol, 0 yok, 1 sağ. */
type Direction = Step | 0;
/** Pointer olayının zamanı (ms). timeStamp yoksa (eski tarayıcı / sentetik olay) performance.now(). */
function eventTime(e: Event): number {
  return Number.isFinite(e.timeStamp) && e.timeStamp > 0 ? e.timeStamp : performance.now();
}

const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'Space']);

export class InputController {
  dir: Direction = 0;
  left = false;
  right = false;
  dasT = 0;
  arrT = 0;
  private readonly gestures: GestureTracker;
  private readonly offs: Off[] = [];
  private readonly deps: InputDeps;

  constructor(deps: InputDeps) {
    this.deps = deps;
    const game = deps.game;
    this.gestures = new GestureTracker({
      move: (d) => game.move(d),
      softStep: () => game.softStep(),
      rotate: (dir) => void game.rotate(dir),
      hardDrop: () => game.hardDrop(),
      hold: () => void game.doHold(),
      onSoftDrop: () => deps.onSoftDrop?.(),
    });
    this.bindKeyboard();
    this.bindPointer();
    this.bindButtons();
    this.bindAutoPause();
  }

  reset(): void {
    this.dir = 0;
    this.left = this.right = false;
    this.deps.game.softDrop = false;
    this.gestures.cancel();
  }
  /** NS4-13: süren dokunmatik jesti sonuçsuz iptal eder (resize, ekran değişimi). */
  cancelGesture(): void {
    this.gestures.cancel();
  }
  press(d: Step): void {
    this.dir = d;
    this.dasT = 0;
    this.arrT = 0;
    this.deps.game.move(d);
  }
  update(dt: number): void {
    const game = this.deps.game,
      settings = this.deps.settings;
    if (!this.dir || game.state !== 'play') return;
    const dir = this.dir; // NS4-04: 0 dışı yön (yukarıdaki kontrol); döngü boyunca değişmez
    this.dasT += dt;
    if (this.dasT < settings.das) return;
    if (settings.arr === 0) {
      while (game.move(dir));
      return;
    }
    this.arrT += dt;
    while (this.arrT >= settings.arr) {
      this.arrT -= settings.arr;
      if (!game.move(dir)) {
        this.arrT = 0;
        break;
      }
    }
  }

  /** Bağlanan bütün DOM dinleyicilerini kaldırır (yeniden başlatma / HMR için). */
  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }

  private bindKeyboard(): void {
    const game = this.deps.game;
    this.offs.push(
      listen(window, 'keydown', (e) => {
        const appState = this.deps.getState(); // işleyici içinde durum değiştiren çağrılardan önce okunur
        if (KEYS.has(e.key) && appState === 'playing') e.preventDefault();
        // NS4-06: alt ekran açıksa Escape önce onu kapatır (pause → Ayarlar → Escape pause ekranına döner);
        // alt ekran açıkken P oyunu sürdürmez. Pause ekranındaki Escape/P davranışı değişmedi.
        if (e.key === 'Escape' && this.deps.closeSub()) return;
        if (appState === 'paused' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
          if (document.querySelector('.screen.on')?.id === 'scr-pause') this.deps.resume();
          return;
        }
        if (appState !== 'playing') return;
        this.deps.onInputMode?.('keyboard');
        if (e.repeat && e.key !== 'ArrowDown') return;
        this.deps.unlockAudio();
        switch (e.key) {
          case 'ArrowLeft':
            this.left = true;
            this.press(-1);
            break;
          case 'ArrowRight':
            this.right = true;
            this.press(1);
            break;
          case 'ArrowDown':
            game.softDrop = true;
            this.deps.onSoftDrop?.();
            break;
          case 'ArrowUp':
          case 'x':
          case 'X':
            game.rotate(1);
            break;
          case 'z':
          case 'Z':
          case 'Control':
            game.rotate(-1);
            break;
          case ' ':
            game.hardDrop();
            break;
          case 'c':
          case 'C':
          case 'Shift':
            game.doHold();
            break;
          case '1':
            game.useCyc();
            break;
          case '2':
            game.useSneeze();
            break;
          case 'Escape':
          case 'p':
          case 'P':
            this.deps.pause();
            break;
        }
      }),
    );
    this.offs.push(
      listen(window, 'keyup', (e) => {
        if (e.key === 'ArrowLeft') {
          this.left = false;
          this.dir = this.right ? 1 : 0;
          this.dasT = 0;
        } else if (e.key === 'ArrowRight') {
          this.right = false;
          this.dir = this.left ? -1 : 0;
          this.dasT = 0;
        } else if (e.key === 'ArrowDown') game.softDrop = false;
      }),
    );
  }

  private bindPointer(): void {
    const cv = this.deps.canvas;
    const tracker = this.gestures;
    const playing = () => this.deps.getState() === 'playing';
    /** Jest yalnızca tahta üzerinde (± yarım hücre) başlar; tahta bilgisi verilmezse her yerde. */
    const onBoard = (e: PointerEvent): boolean => {
      const getBoard = this.deps.getBoard;
      if (!getBoard) return true;
      const b = getBoard(),
        r = cv.getBoundingClientRect(),
        m = this.deps.getCell() * 0.5;
      const x = e.clientX - r.left,
        y = e.clientY - r.top;
      return x >= b.x - m && x <= b.x + b.w + m && y >= b.y - m && y <= b.y + b.h + m;
    };
    this.offs.push(
      listen(cv, 'pointerdown', (e) => {
        if (!playing()) return;
        if (e.pointerType === 'touch') this.deps.onInputMode?.('touch');
        // ikinci parmak: yok sayılır, süren jestin dokunma/fırlatma sonucunu iptal eder
        if (tracker.active) {
          tracker.start(e.pointerId, e.clientX, e.clientY, eventTime(e));
          return;
        }
        if (e.isPrimary === false || !onBoard(e)) return;
        this.deps.unlockAudio();
        try {
          cv.setPointerCapture(e.pointerId);
        } catch {
          /* bilinçli: capture desteklenmezse jest yine çalışır */
        }
        tracker.start(e.pointerId, e.clientX, e.clientY, eventTime(e));
      }),
    );
    this.offs.push(
      listen(cv, 'pointermove', (e) => {
        if (!playing()) return;
        tracker.move(e.pointerId, e.clientX, e.clientY, eventTime(e), this.deps.getCell());
      }),
    );
    this.offs.push(
      listen(cv, 'pointerup', (e) => {
        if (tracker.pointerId !== e.pointerId) return;
        if (!playing()) {
          tracker.cancel();
          return;
        }
        // döndürme yönü: tahtanın sol üçte biri ters, kalanı normal. NS4-13: jestler yalnızca tahtada başladığı
        // için ölçü ekrandan tahtaya taşındı (yatay düzende ekranın sol üçte biri tahtanın dışında kalıyordu).
        // Tahta bilgisi verilmezse eski ölçü (canvas'ın sol üçte biri) kullanılır.
        const r = cv.getBoundingClientRect();
        const board = this.deps.getBoard?.();
        const left = board ? e.clientX - r.left - board.x < board.w / 3 : e.clientX - r.left < r.width / 3;
        const dir = left ? -1 : 1;
        tracker.end(e.pointerId, e.clientX, e.clientY, eventTime(e), this.deps.getCell(), dir);
      }),
    );
    const cancel = (e: PointerEvent) => {
      if (tracker.pointerId === e.pointerId) tracker.cancel();
    };
    this.offs.push(listen(cv, 'pointercancel', cancel));
    this.offs.push(listen(cv, 'lostpointercapture', cancel));
    // ekran boyutu / yönü değişince süren jest geçersizdir (hücre ve tahta konumu değişir)
    this.offs.push(listen(window, 'resize', () => tracker.cancel()));
    this.offs.push(listen(window, 'orientationchange', () => tracker.cancel()));
  }

  private bindBtn(id: string, fn: () => void): void {
    const btn = $(id, HTMLButtonElement);
    this.offs.push(
      listen(btn, 'pointerdown', (e) => {
        e.preventDefault();
        this.deps.unlockAudio();
        fn();
      }),
    );
    this.offs.push(
      listen(btn, 'keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          fn();
        }
      }),
    );
  }

  private bindButtons(): void {
    const game = this.deps.game,
      playing = () => this.deps.getState() === 'playing';
    this.bindBtn('btn-hold', () => {
      if (playing()) game.doHold();
    });
    this.bindBtn('btn-cyc', () => {
      if (playing()) game.useCyc();
    });
    this.bindBtn('btn-sneeze', () => {
      if (playing()) game.useSneeze();
    });
    this.bindBtn('btn-pause', () => {
      if (playing()) this.deps.pause();
    });
  }

  // sekme gizlenince/odak kaybında otomatik mola
  private bindAutoPause(): void {
    this.offs.push(
      listen(document, 'visibilitychange', () => {
        if (document.hidden) this.deps.pause();
      }),
    );
    this.offs.push(listen(window, 'blur', () => this.deps.pause()));
  }
}
