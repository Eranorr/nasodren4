// Küçük DOM yardımcıları (UI framework değildir).
import type { Rect } from '../types/layout';

type ElementType<T extends HTMLElement> = { new (): T; prototype: T };

/**
 * getElementById + tür doğrulaması. Eleman yoksa veya beklenen türde değilse açık hata verir
 * (bütün id'ler index.html'de mevcuttur). Tür verilmezse HTMLElement beklenir.
 */
export function $(id: string): HTMLElement;
export function $<T extends HTMLElement>(id: string, type: ElementType<T>): T;
export function $(id: string, type: ElementType<HTMLElement> = HTMLElement): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} bulunamadı`);
  if (!(el instanceof type)) throw new Error(`#${id} beklenen türde değil (${type.name})`);
  return el;
}

/** NS4-33: SVG öğeleri için $ karşılığı (SVG öğeleri HTMLElement değildir). */
export function svg(id: string): SVGElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} bulunamadı`);
  if (!(el instanceof SVGElement)) throw new Error(`#${id} beklenen türde değil (SVGElement)`);
  return el;
}

/** Mutlak konumlu bir DOM elemanını layout dikdörtgenine yerleştirir. */
export function place(el: HTMLElement, r: Rect): void {
  el.style.left = r.x + 'px';
  el.style.top = r.y + 'px';
  el.style.width = r.w + 'px';
  el.style.height = r.h + 'px';
}

export type Off = () => void;

/** addEventListener + aynı dinleyiciyi kaldıran fonksiyon (dispose için). Olay tipi hedefe göre çıkarılır. */
export function listen<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  fn: (e: WindowEventMap[K]) => void,
): Off;
export function listen<K extends keyof DocumentEventMap>(
  target: Document,
  type: K,
  fn: (e: DocumentEventMap[K]) => void,
): Off;
export function listen<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  fn: (e: HTMLElementEventMap[K]) => void,
): Off;
export function listen(target: EventTarget, type: string, fn: (e: Event) => void): Off {
  target.addEventListener(type, fn);
  return () => target.removeEventListener(type, fn);
}
