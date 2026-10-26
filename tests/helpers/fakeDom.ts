// NS4-06: UI modüllerinin (hud, screens, InputController, lifecycle) Node'da test edilebilmesi için
// en küçük sahte DOM. Yalnızca bu modüllerin kullandığı API yüzeyini taklit eder; render, CSS veya
// layout hesabı yoktur. jsdom gibi bir kütüphane eklenmemiştir. vi.stubGlobal ile kurulan globaller
// vitest.config.ts'teki unstubGlobals ile her testten sonra geri alınır.
import { vi } from 'vitest';

type Listener = (e: unknown) => void;

export class FakeEventTarget {
  private readonly listeners = new Map<string, Listener[]>();
  addEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type);
    if (list)
      this.listeners.set(
        type,
        list.filter((f) => f !== fn),
      );
  }
  /** Olayı dinleyicilere iletir; `preventDefault` çağrısı kaydedilir. */
  dispatch(type: string, init: Record<string, unknown> = {}): { defaultPrevented: boolean } {
    const ev = {
      type,
      repeat: false,
      defaultPrevented: false,
      preventDefault() {
        ev.defaultPrevented = true;
      },
      ...init,
    };
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(ev);
    return ev;
  }
}

class FakeClassList {
  private readonly set = new Set<string>();
  add(...c: string[]): void {
    for (const x of c) this.set.add(x);
  }
  remove(...c: string[]): void {
    for (const x of c) this.set.delete(x);
  }
  toggle(c: string, force?: boolean): boolean {
    const on = force ?? !this.set.has(c);
    if (on) this.set.add(c);
    else this.set.delete(c);
    return on;
  }
  contains(c: string): boolean {
    return this.set.has(c);
  }
}

export class FakeElement extends FakeEventTarget {
  /** NS4-10: odak takibi için kurulu sahte document (focus/blur activeElement'i günceller). */
  static doc: { activeElement: FakeElement | null } | null = null;
  readonly classList = new FakeClassList();
  inert = false;
  /** NS4-13: canvas için ekran dikdörtgeni (sol-üst 0,0). */
  rect = { left: 0, top: 0, width: 390, height: 844 };
  getBoundingClientRect() {
    const r = this.rect;
    return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height };
  }
  hidden = false;
  private readonly attrs = new Map<string, string>();
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  /** NS4-18: etiket adı (createElement / tablo gövdesi). */
  tag = '';
  tabIndex = 0;
  readonly isConnected = true;
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string | undefined> = {};
  readonly children: FakeElement[] = [];
  textContent = '';
  disabled = false;
  className = '';
  title = '';
  constructor(readonly id = '') {
    super();
  }
  /** Yalnızca screens.ts'in kullandığı iki sorgu: [data-focus] ve 'button,a' (ilk çocuk düzeyi). */
  querySelector(sel: string): FakeElement | null {
    if (sel === '[data-focus]') return this.children.find((c) => c.dataset['focus'] !== undefined) ?? null;
    if (sel.includes('button')) return this.children.find((c) => c instanceof FakeButton) ?? null;
    if (/^[a-z]+$/.test(sel)) return this.children.find((c) => c.tag === sel) ?? null; // NS4-18: 'tbody'
    return null;
  }
  contains(el: unknown): boolean {
    for (let p = el instanceof FakeElement ? el : null; p; p = p.parent) if (p === this) return true;
    return false;
  }
  querySelectorAll(): FakeElement[] {
    return [];
  }
  parent: FakeElement | null = null;
  append(...els: FakeElement[]): void {
    for (const el of els) this.appendChild(el);
  }
  appendChild(el: FakeElement): FakeElement {
    el.parent = this;
    this.children.push(el);
    return el;
  }
  set innerHTML(_v: string) {
    this.replaceChildren();
  }
  // NS4-07: popup kutusu (notifications.ts) için çocuk yönetimi
  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  get childElementCount(): number {
    return this.children.length;
  }
  replaceChildren(): void {
    for (const c of this.children) c.parent = null;
    this.children.length = 0;
  }
  remove(): void {
    const p = this.parent;
    if (!p) return;
    const i = p.children.indexOf(this);
    if (i >= 0) p.children.splice(i, 1);
    this.parent = null;
  }
  focus(): void {
    if (FakeElement.doc) FakeElement.doc.activeElement = this;
  }
  blur(): void {
    if (FakeElement.doc?.activeElement === this) FakeElement.doc.activeElement = null;
  }
  /** [data-back] gibi tıklama dinleyicilerini tetikler. */
  click(): void {
    this.dispatch('click');
  }
}
class FakeButton extends FakeElement {}
/** NS4-18: metin girişi (takma ad). */
export class FakeInput extends FakeElement {
  value = '';
}
class FakeOther {}

/** index.html'deki ekran kimlikleri (class="screen"). */
export const SCREEN_IDS = ['scr-start', 'scr-how', 'scr-pause', 'scr-over', 'scr-set', 'scr-scores'] as const;
const BUTTON_IDS = ['btn-hold', 'btn-cyc', 'btn-sneeze', 'btn-pause'];
const ELEMENT_IDS = [
  'hud-score',
  'hud-level',
  'hud-lines',
  'meter-cover',
  'danger',
  'pressure',
  'breath',
  'board-bg',
  'room-hud',
  'room-name',
  'room-gray',
  'room-gray-n',
  'cyc-sub',
  'sneeze-sub',
  'sneeze-fill',
  'badge-mult',
  'toast',
  'popups',
  'tip-start',
  'tip-pause',
  'tip-over',
  'cyc-chip',
  'sneeze-chip',
  'fx-badges',
  // oyun sonu ekranı (renderGameOver)
  'o-score',
  'o-lines',
  'o-best',
  'newbest',
  'o-badges',
  // NS4-18: Skorlar ekranı ve oyun sonu gönderim formu
  'panel-local',
  'panel-global',
  'local-empty',
  'global-status',
  'submit-score',
  'submit-status',
  // NS4-19: CTA bağlantıları (analitik dinleyicileri)
  'cta-over',
  'cta-pause',
];
/** Ekranların odaklanabilir çocukları (index.html sırasıyla; ilk buton ekran açılınca odak alır). */
const SCREEN_BUTTONS: Record<string, readonly string[]> = {
  'scr-start': ['b-play', 'b-how', 'b-set1', 'b-scores'],
  'scr-pause': ['b-resume', 'b-set2', 'b-quit'],
  'scr-over': ['b-again', 'b-menu'],
};

export interface FakeDom {
  readonly window: FakeEventTarget & { dataLayer: unknown[] };
  readonly document: FakeEventTarget & { hidden: boolean; activeElement: FakeElement | null };
  readonly canvas: FakeElement;
  /** Kimliğe göre eleman (yoksa hata). */
  el(id: string): FakeElement;
  /** Görünen ekranın kimliği (`.screen.on`), yoksa null. */
  visibleScreen(): string | null;
  /** Ekranın [data-back] butonu. */
  backButton(screenId: string): FakeElement;
}

/** Sahte DOM'u kurar ve DOM globallerini (document, window, HTMLElement...) taklit eder. */
export function installFakeDom(): FakeDom {
  const byId = new Map<string, FakeElement>();
  const backButtons: FakeElement[] = [];
  // NS4-10: #stage, canvas ve HUD butonlarını içerir (overlay açıkken inert olur)
  const stage = new FakeElement('stage');
  byId.set('stage', stage);
  for (const id of BUTTON_IDS) byId.set(id, stage.appendChild(new FakeButton(id)));
  // NS4-12: öğretici kartı #over-hud içinde (stage'in parçası); Atla / Tamam butonları
  const tut = stage.appendChild(new FakeElement('tutorial'));
  tut.hidden = true;
  byId.set('tutorial', tut);
  for (const id of ['tut-step', 'tut-title', 'tut-text']) byId.set(id, tut.appendChild(new FakeElement(id)));
  for (const id of ['tut-skip', 'tut-done']) byId.set(id, tut.appendChild(new FakeButton(id)));
  const tutDone = byId.get('tut-done');
  if (tutDone) tutDone.hidden = true;
  for (const id of ELEMENT_IDS) byId.set(id, new FakeElement(id));
  for (const id of SCREEN_IDS) {
    const s = new FakeElement(id);
    s.classList.add('screen');
    byId.set(id, s);
    if (id === 'scr-over') {
      const sheet = new FakeElement('scr-over-sheet');
      sheet.dataset['focus'] = '';
      s.appendChild(sheet);
    }
    for (const b of SCREEN_BUTTONS[id] ?? []) byId.set(b, s.appendChild(new FakeButton(b)));
  }
  // NS4-17: Ayarlar açılınca ilk odak ilk ayar kontrolünde (index.html: Ses efektleri, data-focus)
  const setSound = new FakeElement('set-sound');
  setSound.dataset['focus'] = '';
  byId.set('set-sound', setSound);
  byId.get('scr-set')?.appendChild(setSound);
  // NS4-18: Skorlar: ilk odak Yerel sekmesi; sekmeler, tablolar (tbody), yenile/tekrar dene; gönderim formu
  const scores = byId.get('scr-scores');
  for (const id of ['tab-local', 'tab-global']) {
    const t = new FakeButton(id);
    if (id === 'tab-local') t.dataset['focus'] = '';
    byId.set(id, t);
    scores?.appendChild(t);
  }
  for (const id of ['table-local', 'table-global']) {
    const t = new FakeElement(id);
    const body = new FakeElement();
    body.tag = 'tbody';
    t.appendChild(body);
    byId.set(id, t);
  }
  for (const id of ['b-global-retry', 'b-global-refresh', 'b-submit']) byId.set(id, new FakeButton(id));
  byId.set('nick-input', new FakeInput('nick-input'));
  for (const id of ['scr-how', 'scr-set', 'scr-scores']) {
    const b = new FakeButton(id + '-back');
    b.dataset['back'] = '';
    backButtons.push(b);
    byId.get(id)?.appendChild(b);
  }
  // index.html sırası: Nasıl oynanır'da önce Tamam (data-back), sonra Öğreticiyle oyna
  const howTut = new FakeButton('b-tutorial');
  byId.set('b-tutorial', howTut);
  byId.get('scr-how')?.appendChild(howTut);
  byId.get('scr-start')?.classList.add('on'); // index.html: başlangıç ekranı açık gelir
  const screens = () => SCREEN_IDS.map((id) => byId.get(id)).filter((s): s is FakeElement => !!s);

  const doc = Object.assign(new FakeEventTarget(), {
    hidden: false,
    activeElement: null as FakeElement | null,
    getElementById: (id: string) => byId.get(id) ?? null,
    createElement: (tag: string) => Object.assign(new FakeElement(), { tag }),
    querySelectorAll: (sel: string): FakeElement[] => {
      if (sel === '.screen') return screens();
      if (sel === '[data-back]') return backButtons;
      return [];
    },
    querySelector: (sel: string): FakeElement | null => {
      if (sel === '.screen.on') return screens().find((s) => s.classList.contains('on')) ?? null;
      return null;
    },
  });
  // dataLayer: analytics.track() olayları console yerine buraya yazar
  const win = Object.assign(new FakeEventTarget(), { dataLayer: [] as unknown[] });
  FakeElement.doc = doc;
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeButton);
  vi.stubGlobal('HTMLAnchorElement', FakeOther);
  vi.stubGlobal('HTMLInputElement', FakeInput);
  vi.stubGlobal('SVGElement', FakeOther);
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => {
    fn();
    return 0;
  });

  return {
    window: win,
    document: doc,
    canvas: stage.appendChild(new FakeElement('canvas')),
    el(id) {
      const e = byId.get(id);
      if (!e) throw new Error('sahte DOM: #' + id + ' yok');
      return e;
    },
    visibleScreen: () => screens().find((s) => s.classList.contains('on'))?.id ?? null,
    backButton(screenId) {
      const b = backButtons.find((x) => x.id === screenId + '-back');
      if (!b) throw new Error('sahte DOM: ' + screenId + ' geri butonu yok');
      return b;
    },
  };
}
