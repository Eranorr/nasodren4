// Overlay ekranları: göster/gizle, alt ekran yığını, ipucu kutuları, oyun sonu ekranı.
// NS4-03: main.ts'ten taşındı. NS4-06: Escape alt ekranı closeSub() ile kapatır (NS4-01 Not B düzeltildi).
import { TIPS } from '../content/tips';
import { $ } from './dom';
import { fmt } from './hud';
import { ALL_CLEAR } from '../content/rooms';

/** Oyun sonu başlığı (index.html #o-title ile aynı); NS4-31: dört sinüsü açıp bitirince ALL_CLEAR. */
export const OVER_TITLE = 'Sinüslerin tamamen tıkandı';
import { renderBadges } from './badges';
import type { BadgeId } from '../types/content';

export type ScreenId = 'scr-start' | 'scr-how' | 'scr-pause' | 'scr-over' | 'scr-final' | 'scr-set' | 'scr-scores';
export type TipBoxId = 'tip-start' | 'tip-pause' | 'tip-over';

let tipIdx = 0;
/** Rastgele başlangıç ipucu. Orijinalde Game oluşturulduktan sonra çekiliyordu; bootstrap aynı noktada çağırır. */
export function initTips(): void {
  tipIdx = (Math.random() * TIPS.length) | 0;
}
export function setTip(id: TipBoxId): void {
  const [title, body] = TIPS[tipIdx++ % TIPS.length];
  // NS4-04: '<b></b><span></span>' + querySelector! yerine aynı yapı doğrudan kurulur
  const b = document.createElement('b');
  b.textContent = title;
  const s = document.createElement('span');
  s.textContent = body;
  const box = $(id);
  box.textContent = '';
  box.append(b, s);
}

/**
 * NS4-10: overlay açıkken #stage (canvas + HUD butonları) `inert` olur: Tab sırasına girmez, işaretçi
 * olaylarını almaz ve yardımcı teknolojiden gizlenir. Klavye oyun kontrolleri window düzeyinde dinlenir ve
 * uygulama durumuna bağlıdır; inert bunları etkilemez.
 */
function syncStage(overlayOpen: boolean): void {
  const stage = document.getElementById('stage');
  if (stage) stage.inert = overlayOpen;
}
/** Açılışta işaretlemeyle (başlangıç ekranı açık gelir) #stage durumunu eşitler. */
export function initScreens(): void {
  syncStage(!!document.querySelector('.screen.on'));
}

let focusTimer: ReturnType<typeof setTimeout> | undefined;
/** Ekran gösterildikten sonra odağı verir (mevcut 30 ms gecikme korunur). */
function focusSoon(el: HTMLElement | null): void {
  clearTimeout(focusTimer);
  if (el) focusTimer = setTimeout(() => el.focus({ preventScroll: true }), 30);
}

/**
 * Ekranı gösterir (null: bütün overlay'ler kapanır). `focusEl` verilmezse ekranın [data-focus] öğesi veya
 * ilk butonu/bağlantısı odak alır; overlay kapanınca odak oyun alanına (#stage, tabindex=-1) döner.
 */
export function show(id: string | null | undefined, focusEl?: HTMLElement | null): void {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
  const ae = document.activeElement;
  if (ae instanceof HTMLElement || ae instanceof SVGElement) ae.blur();
  syncStage(!!id);
  if (id) {
    const el = $(id);
    el.classList.add('on');
    const f = focusEl ?? (el.querySelector('[data-focus]') || el.querySelector('button,a'));
    focusSoon(f instanceof HTMLElement ? f : null);
  } else {
    // NS4-12: bütün overlay'ler kapandı; dönülecek alt ekran kalmaz (ör. "Nasıl oynanır"dan oyun başlatma)
    screenStack.length = 0;
    focusSoon(document.getElementById('stage'));
  }
}

/** Alt ekran yığını: [data-back] önceki ekrana ve alt ekranı açan öğeye döner. */
interface StackEntry {
  readonly screen: string | undefined;
  readonly opener: HTMLElement | null;
}
const screenStack: StackEntry[] = [];
export function openSub(id: ScreenId): void {
  const ae = document.activeElement;
  screenStack.push({ screen: document.querySelector('.screen.on')?.id, opener: ae instanceof HTMLElement ? ae : null });
  show(id);
}
/** Yığından önceki ekrana döner ([data-back] butonları ve Escape); odak alt ekranı açan butona geri gelir. */
function back(): void {
  const prev = screenStack.pop();
  const target = prev?.screen || 'scr-start';
  const opener = prev?.opener;
  show(target, opener?.isConnected && $(target).contains(opener) ? opener : undefined);
}
export function bindBackButtons(): void {
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', back));
}
/** Alt ekranlar: openSub() ile açılır, geri dönüşte açıldıkları ekrana döner. */
const SUB_SCREENS: readonly string[] = ['scr-how', 'scr-set', 'scr-scores'] satisfies readonly ScreenId[];
/**
 * NS4-06: Açık bir alt ekran varsa geri butonu gibi kapatır ve true döner (Escape için).
 * Pause'dan açılan Ayarlar böylece önce pause ekranına döner (NS4-01 Not B).
 */
export function closeSub(): boolean {
  const id = document.querySelector('.screen.on')?.id;
  if (id === undefined || !SUB_SCREENS.includes(id)) return false;
  back();
  return true;
}

export interface GameOverView {
  readonly score: number;
  readonly lines: number;
  readonly best: number;
  readonly isBest: boolean;
  /** NS4-31: final ekranında "Bitir" (yenilgi değil): başlık "Bütün sinüsler açık!". */
  readonly complete?: boolean;
  /** NS4-16: yalnızca dev ekran gösterimi (storage'a yazmadan örnek rozet durumu). Oyunda verilmez. */
  readonly badges?: { readonly earned: readonly BadgeId[]; readonly fresh: readonly BadgeId[] };
}

export function renderGameOver(r: GameOverView): void {
  $('o-title').textContent = r.complete ? ALL_CLEAR : OVER_TITLE;
  $('o-score').textContent = fmt(r.score);
  $('o-lines').textContent = String(r.lines);
  $('o-best').textContent = fmt(r.best);
  $('newbest').style.display = r.isBest ? 'block' : 'none';
  if (r.badges) renderBadges($('o-badges'), r.badges.earned, r.badges.fresh);
  else renderBadges($('o-badges'));
  setTip('tip-over');
  show('scr-over');
}
