// NS4-19: görünür içerik güvenliği. Envanter bütün ekranları kapsar; marka adı, satın alma çağrısı, teşhis/tedavi
// vaadi, "doğal = risksiz" ve aşağılayıcı sentetik dili taranır; tıbbi uyarı, sağlık metinleri ve CTA'lar değişmez.
// Bu testler metni DÜZELTMEZ: yalnızca değişikliği yakalar. İnceleme notları docs/NS4-19-CONTENT-SAFETY-AUDIT.md'dedir.
import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import { ctaUrl } from '../../src/analytics/cta';
import { CFG } from '../../src/config/gameConfig';
import { HEALTH_STATIC, HEALTH_TIPS, HEALTH_TOASTS, allHealthContent } from '../../src/content/health';

const HEALTH_CONTENT = allHealthContent();
import { TIPS } from '../../src/content/tips';
import { ALL_VISIBLE, INVENTORY, PAGE_TEXT, visibleText, type Area } from '../helpers/inventory';

const files = import.meta.glob<string>(['../../src/**/*.ts', '../../index.html'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const corpus = [PAGE_TEXT, ...ALL_VISIBLE].join('\n');

describe('içerik envanteri', () => {
  it('bütün ekran ve alanları kapsar (her alan dolu)', () => {
    const areas: Area[] = [
      'ana_menu',
      'ogretici',
      'nasil_oynanir',
      'hud',
      'guclendiriciler',
      'mola',
      'ayarlar',
      'oyun_sonu',
      'saglik_ipuclari',
      'skor_ekrani',
      'global_gonderim',
      'hata_mesajlari',
      'cta',
      'bildirimler',
      'rozetler',
    ];
    expect(Object.keys(INVENTORY).sort()).toEqual([...areas].sort());
    for (const a of areas) expect(INVENTORY[a].length, a).toBeGreaterThan(0);
    // her overlay ekranı envanterde
    for (const id of ['scr-start', 'scr-how', 'scr-pause', 'scr-over', 'scr-set', 'scr-scores'])
      expect(html).toContain(`<section id="${id}"`);
    expect([...html.matchAll(/<section id="(scr-[a-z]+)"/g)].map((m) => m[1])).toEqual([
      'scr-start',
      'scr-how',
      'scr-pause',
      'scr-over',
      'scr-scores',
      'scr-set',
    ]);
  });
  it('sağlık içerik kaydı: benzersiz kimlik; hepsi inceleme bekliyor, kaynak uydurulmadı', () => {
    const ids = HEALTH_CONTENT.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of HEALTH_CONTENT) {
      expect(h.approval, h.id).toBe('review_required');
      expect(h.source, h.id).toBeNull();
      expect(h.text.trim(), h.id).toBe(h.text);
    }
  });
  it('kayıttaki statik metinler kaynak dosyalarında aynen yerinde (tek karakter değişmedi)', () => {
    for (const h of HEALTH_STATIC) {
      const file = h.location.startsWith('index.html') ? '../../index.html' : `../../${h.location.split(' ')[0] ?? ''}`;
      const src = files[file];
      expect(src, `${h.id} → ${file}`).toBeDefined();
      const hay = file.endsWith('.html') ? visibleText(src ?? '') : (src ?? '');
      expect(hay, h.id).toContain(h.text);
    }
  });
});

describe('sağlık metinleri değişmedi (NS4-18 / 93adcf1 ile birebir)', () => {
  it('ipuçları: sıra ve metin aynı; çalışma anı TIPS kayıttan gelir', () => {
    expect(TIPS).toEqual([
      [
        'Paranazal sinüsler',
        'Kafatasındaki hava dolu boşluklardır: maksiller (yanak), frontal (alın), etmoid (gözler arası) ve sfenoid (kafa tabanı).',
      ],
      [
        'Tıkanıklık nasıl olur?',
        'Sinüzitte mukoza zarı iltihaplanır ve sinüs ağızları (ostiumlar) tıkanabilir. Yüzde baskı, baş ağrısı ve koku kaybı görülebilir.',
      ],
      [
        'Sıklamen',
        'Cyclamen europaeum L., Primulaceae familyasından yumrulu bir bitkidir. Yumrusu saponin içerir; ekstresinin burun mukozasında ozmotik etkiyle mukus akışını artırdığı bildirilmektedir.',
      ],
      [
        'Kullanım süresine dikkat',
        'Dekonjestan burun spreylerinin önerilenden uzun kullanımı, tıkanıklığın daha şiddetli geri dönmesine (rinitis medikamentoza) yol açabilir. Prospektüsteki süreye uyun.',
      ],
      [
        'Ne zaman hekime gitmeli?',
        '10 günü aşan, ateşle seyreden, göz çevresinde şişlik yapan ya da giderek kötüleşen şikâyetlerde bir hekime başvurun.',
      ],
      [
        'Sıvı tüketimi',
        'Gün içinde yeterli sıvı almak ve burnu tuzlu suyla yıkamak mukusun akışkan kalmasına yardımcı olabilir.',
      ],
    ]);
    expect(HEALTH_TIPS).toHaveLength(6);
  });
  it('toast metinleri aynı ve kayıttan okunur', () => {
    // NS4-24: rebound toast'u sentetik açıcıyla birlikte kaldırıldı
    expect(Object.keys(HEALTH_TOASTS)).toEqual(['cyclamenReady']);
    expect(HEALTH_TOASTS.cyclamenReady.text).toBe('Sinüslerin dolmaya başladı. Sıklamen özütü hazır.');
    expect(files['../../src/ui/hud.ts']).toContain('toast(HEALTH_TOASTS.cyclamenReady.text)');
  });
  it('tıbbi uyarı ana menüde aynen korunur', () => {
    const start = html.slice(
      html.indexOf('<section id="scr-start"'),
      html.indexOf('</section>', html.indexOf('<section id="scr-start"')),
    );
    expect(visibleText(/<p class="fine">([\s\S]*?)<\/p>/.exec(start)?.[1] ?? '')).toBe(
      'Bu oyun bilgilendirme ve eğlence amaçlıdır; tıbbi tavsiye yerine geçmez. Şikâyetleriniz için hekiminize veya eczacınıza danışın.',
    );
  });
});

describe('marka ve iddia taraması (görünür metin)', () => {
  it('kullanıcıya görünür marka adı yok', () => {
    expect(corpus).not.toMatch(/nasodren|naso\s*dren/i);
    for (const [f, s] of Object.entries(files)) expect(s, f).not.toMatch(/nasodren/i);
  });
  it('satın alma / ürün kullanma çağrısı yok', () => {
    expect(corpus).not.toMatch(
      /satın al|sipariş|indirim|kampanya|fiyat|eczaneden al|hemen (al|dene)|ürünü(müzü)? kullan|reçetesiz al|stoklarda/i,
    );
  });
  it('teşhis veya kesin tedavi vaadi yok', () => {
    expect(corpus).not.toMatch(
      /tedavi eder|iyileştirir|iyileşirsin|şifa|kesin(likle)? (çözüm|tedavi|etkili)|garanti|teşhis (koy|et)|%\s?100|mucize/i,
    );
  });
  it('"doğal" ifadesi risksizlik garantisine dönüşmüyor', () => {
    const natural = ALL_VISIBLE.filter((t) => /doğal/i.test(t));
    expect(natural).toEqual([]); // NS4-24: "Doğal yol" rozeti kaldırıldı
    expect(corpus).not.toMatch(/doğal[^.]{0,40}(risksiz|zararsız|güvenli|yan etkisiz|sorunsuz)/i);
  });
  it('NS4-24: sentetik açıcı / rebound karşılaştırması oyundan kalktı; dekonjestan yalnızca sağlık ipucunda', () => {
    expect(corpus).not.toMatch(/sentetik|rebound|açıcı|geri tep/i);
    const decon = ALL_VISIBLE.filter((t) => /dekonjestan/i.test(t));
    const tips: readonly string[] = HEALTH_TIPS.map((t) => t.text);
    for (const t of decon) expect(tips).toContain(t);
  });
  it('NS4-24: hapşırık ve oyun metinleri iğrenç / ıslak dil içermez (her yaşa uygun)', () => {
    expect(corpus).toMatch(/hapşırık/i);
    expect(corpus).not.toMatch(/sümük|balgam|tükür|iğrenç|yapış|salya|vıcık/i);
  });
  it('CTA sağlık bilgisi yönlendirmesi olarak kalır (rehber), ürün/satış dili yok', () => {
    expect(INVENTORY.cta).toEqual(['Sinüs sağlığı rehberi', 'Rahat nefes rehberini aç']);
    for (const t of INVENTORY.cta) expect(t).toMatch(/rehber/);
  });
});

describe('CTA ve UTM değişmedi', () => {
  it('URL ve UTM değerleri; iki yerleşim; yeni sekmede, noopener', () => {
    expect(CFG.cta).toBe('https://www.yasasinsaglik.com/');
    for (const placement of ['game_over', 'pause_menu'] as const) {
      const u = new URL(ctaUrl(placement));
      expect(u.origin + u.pathname).toBe('https://www.yasasinsaglik.com/');
      expect(Object.fromEntries(u.searchParams)).toEqual({
        utm_source: 'ferah_nefes_oyun',
        utm_medium: 'advergame',
        utm_campaign: 'sinus_bulmaca',
        utm_content: placement,
      });
    }
    expect(html.match(/class="btn [a-z]+" id="cta-(over|pause)" target="_blank" rel="noopener"/g)).toHaveLength(2);
    expect([...html.matchAll(/<a\s/g)]).toHaveLength(2); // yeni CTA yok
  });
});
