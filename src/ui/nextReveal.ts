/* =====================================================================
   NS4-38: "Sıradaki" gizem kartı. Sıraya yeni bir parça girince önce siyah
   bir "?" kartı görünür (oyunlarda henüz bulunmamış eşya kartı gibi); kısa
   süre sonra kart yatayda dönüp kapanır ve parça açılır. Kart kapalıyken
   yavaşlayan yumuşak tıklar, açılırken hafif bir çan çalar (ses
   SoundManager.revealTick / revealChime; bu modül yalnızca zamanlar).
   Hızlı oyunda (parçalar art arda geliyorsa) kısa sürüm oynar: tık yok,
   bekleme kısa, çan daha kısık. Hareketi azalt tercihinde kart döner yerine
   söner, parça ölçeklenmeden belirir. Oyun kuralı değişmez: parça kuyrukta
   zaten bellidir, yalnızca gösterim gecikir.
   NS4-39: bekleme seviye arttıkça kısalır (parçalar hızlanınca planlama
   cezası büyümesin); tıklar kısalan bekleme içine sığanlarla sınırlı.
   ===================================================================== */
import { $ } from './dom';

export const REVEAL = {
  /** Kartın kapalı kaldığı süre (ms; 1. seviye). */
  hideMs: 380,
  /** NS4-39: her seviyede bekleme bu kadar kısalır (ms), en az minHideMs (12. seviyeden sonra sabit). */
  levelStepMs: 20,
  minHideMs: 160,
  /** Kartın kapanıp parçanın açıldığı süre (ms; ilk yarı kart, ikinci yarı parça). */
  flipMs: 200,
  /** Tık zamanları (ms; aralıklar uzar: çark yavaşlıyor). hideMs'ten küçük olmalı. */
  ticks: [0, 70, 160, 280],
  /** Önceki açılıştan bu süre (ms) geçmeden yeni parça gelirse kısa sürüm oynar. */
  fastGapMs: 900,
  fastHideMs: 110,
} as const;

/** Bir karedeki görünüm: kartın ve parçanın yatay ölçeği (0..1; parça açılırken hafifçe taşar). */
export interface RevealFrame {
  readonly card: number;
  readonly piece: number;
  readonly done: boolean;
}

/** NS4-39: seviyeye göre kartın kapalı kalma süresi (ms). */
export function hideMsFor(level: number): number {
  return Math.max(REVEAL.minHideMs, REVEAL.hideMs - (Math.max(1, level) - 1) * REVEAL.levelStepMs);
}

/** Açılışta parçanın hafifçe taşıp yerine oturması. */
function easeOutBack(k: number): number {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
}

/** Saf zaman çizelgesi: açılış başladıktan `t` ms sonra kart ve parça ölçeği. */
export function revealFrame(t: number, hide: number, flip: number = REVEAL.flipMs): RevealFrame {
  const half = flip / 2;
  if (t < hide) return { card: 1, piece: 0, done: false };
  if (t < hide + half) return { card: 1 - (t - hide) / half, piece: 0, done: false };
  if (t < hide + flip) return { card: 0, piece: easeOutBack((t - hide - half) / half), done: false };
  return { card: 0, piece: 1, done: true };
}

export interface RevealSound {
  revealTick(i: number): void;
  revealChime(fast: boolean): void;
}
export interface RevealView {
  setNextReveal(visible: boolean, sx?: number, sy?: number): void;
}
/** Game'den okunanlar: çekilen parça sayacı ve durum (açılış yalnızca oynanırken başlar). */
export interface RevealGame {
  readonly dealt: number;
  readonly level: number;
  readonly state: string;
}

export class NextReveal {
  /** Son görülen Game.dealt (-1: henüz yok). */
  private dealt = -1;
  private active = false;
  private t = 0;
  private hide: number = REVEAL.hideMs;
  private fast = false;
  private tick = 0;
  /** Son açılışın başlangıcından beri geçen süre (ms). */
  private since = Infinity;
  private readonly view: RevealView;
  private readonly sound: RevealSound;
  private readonly reduced: () => boolean;

  constructor(view: RevealView, sound: RevealSound, reduced: () => boolean) {
    this.view = view;
    this.sound = sound;
    this.reduced = reduced;
  }

  /** Kart şu an kapalı mı (parça gizli). Test ve tanı için. */
  get hidden(): boolean {
    return this.active && this.t < this.hide + REVEAL.flipMs / 2;
  }

  /**
   * Her karede çağrılır (oynanırken ve oyun sonunda). Yeni parça sıraya girdiyse açılışı başlatır; oda geçişinde
   * kuyruğa geri dönen parça (sayaç azalır) ve oynanmazken gelen parça hemen gösterilir.
   */
  update(g: RevealGame, dt: number, playing: boolean): void {
    this.since += dt;
    if (g.dealt !== this.dealt) {
      const fresh = g.dealt > this.dealt;
      this.dealt = g.dealt;
      if (fresh && playing && g.state === 'play') this.start(g.level);
      else this.finish();
    }
    if (!this.active) return;
    if (!playing) return this.finish();
    this.t += dt;
    // tıklar yalnızca kart kapalıyken (seviye yükselince sondakiler düşer)
    if (!this.fast)
      for (; this.tick < REVEAL.ticks.length && this.t >= REVEAL.ticks[this.tick]; this.tick++)
        if (REVEAL.ticks[this.tick] < this.hide) this.sound.revealTick(this.tick);
    const before = this.t - dt;
    if (before < this.hide && this.t >= this.hide) this.sound.revealChime(this.fast);
    this.render(revealFrame(this.t, this.hide));
  }

  private start(level: number): void {
    this.fast = this.since < REVEAL.fastGapMs;
    this.hide = this.fast ? REVEAL.fastHideMs : hideMsFor(level);
    this.since = 0;
    this.active = true;
    this.t = 0;
    this.tick = 0;
    $('next-mystery').classList.add('on');
    this.render(revealFrame(0, this.hide));
  }

  /** Açılışı bitirir: kart kapanır, parça tam ölçekte görünür. */
  finish(): void {
    this.active = false;
    this.render({ card: 0, piece: 1, done: true });
  }

  private render(f: RevealFrame): void {
    const el = $('next-mystery');
    if (f.done) {
      this.active = false;
      el.classList.remove('on');
      el.style.transform = '';
      el.style.opacity = '';
      this.view.setNextReveal(true);
      return;
    }
    if (this.reduced()) {
      el.style.opacity = String(f.card);
      this.view.setNextReveal(f.card === 0);
      return;
    }
    el.style.transform = `scale(${Math.max(0.001, f.card)}, ${0.9 + 0.1 * f.card})`;
    this.view.setNextReveal(f.piece > 0, f.piece, 0.92 + 0.08 * Math.min(1, f.piece));
  }
}
