// NS4-19: kullanıcıya görünen bütün metinlerin envanteri (ekran / alan bazında). index.html bölümlerinden ve
// metin tablosu tutan kaynak modüllerden toplanır. İçerik denetimi testleri ve denetim dokümanı bunu kullanır.
import html from '../../index.html?raw';
import eventsSrc from '../../src/app/events.ts?raw';
import hudSrc from '../../src/ui/hud.ts?raw';
import badgesUiSrc from '../../src/ui/badges.ts?raw';
import tutorialViewSrc from '../../src/ui/tutorialView.ts?raw';
import settingsPanelSrc from '../../src/ui/settingsPanel.ts?raw';
import { BADGES } from '../../src/content/badges';
import { ROOMS } from '../../src/config/gameConfig';
import {
  ALL_CLEAR,
  CLOUD_HINT,
  FREE_GOAL,
  FREE_NAME,
  ROOM_CLEAR,
  ROOM_GOAL,
  ROOM_NEXT_FINAL,
  roomLabel,
  roomText,
} from '../../src/content/rooms';
import { FULL_RELIEF, FULL_RELIEF_SUB } from '../../src/content/relief';
import { HEALTH_TIPS, HEALTH_TOASTS } from '../../src/content/health';
import { CYC_NAME, CYC_SHORT, CYC_TEXT, SNEEZE_NAME, SNEEZE_SHORT, SNEEZE_TEXT } from '../../src/ui/powerups';
import { GLOBAL_TEXT, NO_NICKNAME } from '../../src/ui/scoresView';
import { SUBMIT_TEXT } from '../../src/ui/submitScore';
import { ROTATE_O_NOTE, STEP_COPY, TUTORIAL_DONE_TEXT } from '../../src/tutorial/steps';

export type Area =
  | 'ana_menu'
  | 'ogretici'
  | 'nasil_oynanir'
  | 'hud'
  | 'guclendiriciler'
  | 'mola'
  | 'ayarlar'
  | 'oyun_sonu'
  | 'saglik_ipuclari'
  | 'skor_ekrani'
  | 'global_gonderim'
  | 'hata_mesajlari'
  | 'cta'
  | 'bildirimler'
  | 'rozetler';

/** Görünür metin: yorum/SVG/etiket atılır, boşluk tekleşir. */
export function visibleText(s: string): string {
  return (
    s
      .replace(/<!--[\s\S]*?-->/g, '')
      // Prettier SVG kapanışını satıra bölebilir (</svg + satır sonu + >)
      .replace(/<svg[\s\S]*?<\/svg\s*>/g, '')
      .replace(/<br\s*\/?>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
/** Bölümdeki metin düğümleri (her öğe ayrı satır). */
function nodes(fragment: string): string[] {
  const out: string[] = [];
  const clean = fragment.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg\s*>/g, '');
  for (const m of clean.matchAll(/>([^<>]+)</g)) {
    const t = (m[1] ?? '').replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  // <b>/<kbd> ile bölünmüş satırları blok öğe düzeyinde birleştir
  return out;
}
export function section(id: string): string {
  const a = html.indexOf(`<section id="${id}"`);
  if (a < 0) throw new Error('bölüm yok: ' + id);
  return html.slice(a, html.indexOf('\n      </section>', a));
}
/** Blok öğe metinleri (p, li, dt, dd, h1-h3, button, a, label, th, small, legend, b.tip). */
function blocks(fragment: string): string[] {
  const re =
    /<(h1|h2|h3|p|li|dt|dd|button|a|label|th|small|legend|span(?: class="[^"]*")?|div class="newbest")\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|p|li|dt|dd|button|a|label|th|small|legend|span|div)>/g;
  const out: string[] = [];
  for (const m of fragment.matchAll(re)) {
    const t = visibleText(m[2] ?? '');
    if (t && !out.includes(t)) out.push(t);
  }
  return out.length ? out : nodes(fragment);
}
/** Kaynak dosyadaki popup/toast metinleri (+ events.ts skor popup parçaları). */
function notices(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:big|sub) = '([^']+)'/g)) if (m[1]) out.push(m[1]);
  const names = /const names = \[([^\]]+)\]/.exec(src)?.[1];
  if (names)
    for (const n of names.split(',')) {
      const t = n.trim().replace(/^'|'$/g, '');
      if (t) out.push(t);
    }
  if (/\+ ' drenaj'/.test(src)) out.push('<satır adı> drenaj');
  for (const m of src.matchAll(/`([^`]*(?:Kombo|kombo|T-spin)[^`]*)`|'((?:Art arda|Mini |T-spin)[^']*)'/g)) {
    const t = m[1] ?? m[2];
    if (t) out.push(t);
  }
  for (const m of src.matchAll(/(?:popup|toast)\(\s*(['`])([^'`]+)\1(?:,\s*(['`])([^'`]+)\3)?/g)) {
    if (m[2]) out.push(m[2]);
    if (m[4]) out.push(m[4]);
  }
  return out;
}
const hudHtml = html.slice(html.indexOf('<div id="stage"'), html.indexOf('<div id="tutorial"'));
const tutorialHtml = html.slice(html.indexOf('<div id="tutorial"'), html.indexOf('<div id="danger">'));

export const INVENTORY: Readonly<Record<Area, readonly string[]>> = {
  ana_menu: blocks(section('scr-start')),
  ogretici: [
    ...blocks(tutorialHtml),
    ...Object.values(STEP_COPY).flatMap((c) => [c.title, c.keyboard, c.touch]),
    ROTATE_O_NOTE,
    TUTORIAL_DONE_TEXT,
    ...[...tutorialViewSrc.matchAll(/`(Öğretici[^`]*)`/g)].map((m) => m[1] ?? ''),
  ],
  nasil_oynanir: blocks(section('scr-how')),
  hud: [
    ...nodes(hudHtml.slice(0, hudHtml.indexOf('<button id="btn-hold"'))),
    // NS4-27: oda etiketleri
    ...ROOMS.map((_, i) => roomLabel(i)),
    FREE_NAME,
    'Bulutçuk',
    ...[...hudSrc.matchAll(/`((?:Ferah nefes)[^`]*)`/g)].map((m) => m[1] ?? ''),
  ],
  guclendiriciler: [
    ...blocks(hudHtml.slice(hudHtml.indexOf('<button id="btn-hold"'))),
    CYC_NAME,
    SNEEZE_NAME,
    ...Object.values(CYC_TEXT),
    ...Object.values(SNEEZE_TEXT),
    ...Object.values(CYC_SHORT),
    ...Object.values(SNEEZE_SHORT),
  ],
  mola: blocks(section('scr-pause')),
  ayarlar: [
    ...blocks(section('scr-set')),
    ...[...settingsPanelSrc.matchAll(/textContent = '([^']+)'/g)].map((m) => m[1] ?? ''),
  ],
  oyun_sonu: [
    visibleText(/<div class="newbest" id="newbest">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''),
    ...blocks(section('scr-over')),
    ALL_CLEAR, // NS4-31: "Bitir" ile biten oyunun başlığı
    // NS4-31: final ekranı
    ...blocks(section('scr-final')),
  ],
  saglik_ipuclari: HEALTH_TIPS.flatMap((t) => [t.title, t.text]),
  skor_ekrani: [...blocks(section('scr-scores')), ...Object.values(GLOBAL_TEXT), NO_NICKNAME],
  global_gonderim: [
    ...blocks(/<form class="submit-score"[\s\S]*?<\/form>/.exec(html)?.[0] ?? ''),
    ...Object.values(SUBMIT_TEXT),
  ],
  hata_mesajlari: [
    GLOBAL_TEXT.failed,
    GLOBAL_TEXT.offline,
    SUBMIT_TEXT.failed,
    SUBMIT_TEXT.invalidNick,
    SUBMIT_TEXT.rejected,
    SUBMIT_TEXT.rate,
    SUBMIT_TEXT.disabled,
    ...[...settingsPanelSrc.matchAll(/textContent = '([^']+)'/g)].map((m) => m[1] ?? ''),
  ],
  cta: [
    visibleText(/id="cta-pause"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] ?? ''),
    visibleText(/id="cta-over"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] ?? ''),
  ],
  bildirimler: [
    ...notices(eventsSrc),
    ...notices(hudSrc),
    HEALTH_TOASTS.cyclamenReady.text,
    ...notices(badgesUiSrc),
    // NS4-27: oda popup'ları (şablonlu metinler)
    ...ROOMS.map((_, i) => `${i + 1}. oda · ${roomText(i).name}`),
    ROOM_GOAL,
    // NS4-31: oda açılış kartı (harita)
    ROOM_CLEAR,
    ...ROOMS.map((_, i) => `${roomText(i).name} ferahladı · +<bonus>`),
    ...ROOMS.slice(1).map((_, i) => `Sıradaki: ${roomText(i + 1).name}`),
    ROOM_NEXT_FINAL,
    FREE_NAME,
    FREE_GOAL,
    // NS4-30: ilk bulutçuk ipucu
    CLOUD_HINT,
    // NS4-22: Tam Ferahlık popup'ı
    FULL_RELIEF,
    `${FULL_RELIEF_SUB} · +<bonus>`,
  ],
  rozetler: Object.values(BADGES).flatMap((b) => [b.name, b.desc]),
};

/** Bütün görünür metinler (tekrarsız). */
export const ALL_VISIBLE: readonly string[] = [...new Set(Object.values(INVENTORY).flat())];
/** Sayfa genelinde görünür metin (index.html) + kaynak metin tabloları. */
export const PAGE_TEXT = visibleText(html.slice(html.indexOf('<body>')));
