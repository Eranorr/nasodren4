// NS4-09: başlangıç ekranı için statik sözleşme testleri (içerik, eylemler, görsel varlıklar, hareket, hedef boyutu).
// Gerçek yerleşim (5 viewport, 844×390 erişimi, reduced motion) headless tarayıcı smoke'unda ölçülür.
import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import css from '../../src/styles.css?raw';
import { mediaBlock, plainCss, px, rule } from '../helpers/css';

const start = (() => {
  const a = html.indexOf('<section id="scr-start"');
  return html.slice(a, html.indexOf('</section>', a));
})();
/** Etiketleri atılmış, boşlukları normalleştirilmiş görünür metin (<br> boşluk sayılır; SVG içeriği hariç). */
const text = (s: string) =>
  s
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

describe('başlangıç ekranı içeriği', () => {
  it('metinler NS4-08 ile aynı', () => {
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(start)?.[1] ?? '';
    expect(text(h1)).toBe('Ferah Nefes');
    expect(text(/<p class="lead"[^>]*>([\s\S]*?)<\/p>/.exec(start)?.[1] ?? '')).toBe(
      'Sinüslerini tıkayan blokları yerleştir, satırları temizle, nefesini aç.',
    );
    expect(text(/<p class="fine"[^>]*>([\s\S]*?)<\/p>/.exec(start)?.[1] ?? '')).toBe(
      'Bu oyun bilgilendirme ve eğlence amaçlıdır; tıbbi tavsiye yerine geçmez. Şikâyetleriniz için hekiminize veya eczacınıza danışın.',
    );
  });

  it('tek birincil eylem (Oyna) ve ikincil eylemler (NS4-18: + Skorlar); CTA yok', () => {
    const buttons = [...start.matchAll(/<button class="([^"]+)" id="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => [
      m[2],
      m[1],
      text(m[3] ?? ''),
    ]);
    // NS4-41: ikincil eylemler eşit karolar (Nasıl oynanır · Skorlar · Ayarlar)
    expect(buttons).toEqual([
      ['b-play', 'btn primary', 'Oyna'],
      ['b-how', 'btn ghost tile', 'Nasıl oynanır'],
      ['b-scores', 'btn ghost tile', 'Skorlar'],
      ['b-set1', 'btn ghost tile', 'Ayarlar'],
    ]);
    expect(start).not.toMatch(/<a\s/);
    expect((start.match(/<button/g) ?? []).length).toBe(4);
  });

  it('marka adı ve haricî görsel yok', () => {
    expect(html).not.toMatch(/nasodren/i);
    expect(start).not.toMatch(/<img|<video|<canvas|<iframe/);
    expect(css).not.toMatch(/url\(\s*['"]?(https?:|\/\/)/);
  });

  it('dekoratif SVG’ler yardımcı teknolojiden gizli; sıklamen yaprak, gövde ve yaprak (leaf) içerir', () => {
    const svgs = [...start.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    for (const s of svgs) expect(s).toMatch(/aria-hidden="true"/);
    const flower = /<svg class="start-flower"[\s\S]*?<\/svg>/.exec(start)?.[0] ?? '';
    expect((flower.match(/class="petal/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(flower).toMatch(/class="stem/);
    expect(flower).toMatch(/class="leaf/);
    expect(start).toMatch(/<svg class="airflow"/);
  });
});

describe('başlangıç ekranı stilleri', () => {
  it('Oyna en az 56 px, ikincil eylemler en az 48 px yüksekliğinde', () => {
    expect(px(rule('#scr-start .btn.primary'), 'min-height')).toBeGreaterThanOrEqual(56);
    expect(px(rule('.btn'), 'min-height')).toBeGreaterThanOrEqual(48);
  });

  it('atmosfer ve giriş hareketi reduced motion altında kapanır', () => {
    const animated = [...plainCss.matchAll(/([^{}]+)\{[^{}]*animation:\s*(?!none)[^;]+;/g)]
      .map((m) => (m[1] ?? '').trim())
      .filter((s) => s.includes('#scr-start'));
    expect(animated.length).toBeGreaterThan(0);
    const reduced = mediaBlock('@media (prefers-reduced-motion: reduce)');
    for (const sel of animated) {
      for (const part of sel.split(',')) expect(reduced, part.trim()).toContain(part.trim());
    }
    expect(reduced).toMatch(/#scr-start[^{]*\{[^}]*animation:\s*none/);
  });

  it('başlangıç ekranı stilleri yalnızca tasarım tokenlarını kullanır (yeni sabit renk yok)', () => {
    const startRules = [...plainCss.matchAll(/([^{}]*#scr-start[^{}]*)\{([^{}]*)\}/g)].map((m) => m[2] ?? '');
    expect(startRules.length).toBeGreaterThan(3);
    for (const body of startRules) expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('odak halkası ortak kuraldan gelir ve başlangıç ekranında geçersiz kılınmaz', () => {
    for (const m of plainCss.matchAll(/([^{}]*#scr-start[^{}]*)\{([^{}]*)\}/g)) {
      if (/focus/.test(m[1] ?? '')) expect(m[2]).not.toMatch(/outline:\s*(none|0)/);
    }
  });
});
