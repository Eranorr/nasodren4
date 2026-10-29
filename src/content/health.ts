/* =====================================================================
   İÇERİK: görünür sağlık metinleri kaydı (NS4-19)
   Oyunda kullanıcıya görünen sağlıkla ilgili bütün metinler burada tek bir
   tipli listede envanterlenir. Metinler NS4-18 (93adcf1) ile birebir aynıdır;
   tek karakter değiştirilmemiştir.
   - `tip` ve `toast` kayıtları çalışma anında doğrudan bu modülden okunur.
   - `index.html` içindeki statik metinler (ana menü, Nasıl oynanır, oyun sonu,
     CTA) yerinde kalır; kayıt yalnızca envanter ve denetim içindir
     (tests/content testleri metnin aynen yerinde olduğunu doğrular).
   Hiçbir metnin onay kaydı veya kaynak bilgisi bu depoda yoktur: hepsi
   `review_required`, kaynak `null` (uydurulmadı). Değişiklikler ayrı bir
   editoryal / tıbbi / hukuki onay sürecine tabidir
   (docs/NS4-19-CONTENT-SAFETY-AUDIT.md).
   ===================================================================== */

export type HealthPlacement =
  | 'tip' // ipucu kutuları (ana menü, mola, oyun sonu; rastgele)
  | 'start_lead'
  | 'start_disclaimer'
  | 'how_to'
  | 'game_over'
  | 'cta'
  | 'toast'
  | 'popup'
  | 'powerup'
  | 'badge';
export type ApprovalStatus = 'review_required' | 'approved';

export interface HealthContent {
  readonly id: string;
  readonly placement: HealthPlacement;
  /** Metnin bulunduğu yer (dosya ve öğe). */
  readonly location: string;
  readonly title?: string;
  /** Görünür metin (HTML etiketsiz, boşluklar tek). */
  readonly text: string;
  readonly approval: ApprovalStatus;
  /** Bilimsel / editoryal kaynak; bilinmiyorsa null. */
  readonly source: string | null;
}

const R = 'review_required' as const;

/** Sağlık ipuçları (sıra korunur; screens.ts setTip bu sırayla döner). */
export const HEALTH_TIPS = [
  {
    id: 'tip.paranasal',
    placement: 'tip',
    location: 'src/content/health.ts → #tip-start/#tip-pause/#tip-over',
    title: 'Sinüsler nerede?',
    text: 'Yüzündeki hava dolu küçük boşluklardır: yanaklarda, alında, gözlerin arasında ve burnun en arkasında (kafa tabanında).',
    approval: R,
    source: null,
  },
  {
    id: 'tip.congestion',
    placement: 'tip',
    location: 'src/content/health.ts → ipucu kutuları',
    title: 'Tıkanıklık nasıl olur?',
    text: 'Sinüzitte burnun ve sinüslerin iç yüzeyi şişer, sinüslerin ağzı tıkanabilir. Yüzde baskı, baş ağrısı ve koku almada azalma görülebilir.',
    approval: R,
    source: null,
  },
  {
    id: 'tip.cyclamen',
    placement: 'tip',
    location: 'src/content/health.ts → ipucu kutuları',
    title: 'Sıklamen',
    text: 'Sıklamen, toprak altında yumrusu olan bir çiçektir (Cyclamen europaeum). Yumrusundan elde edilen özütün, burundaki salgının daha kolay akmasına yardımcı olduğu bildirilmektedir.',
    approval: R,
    source: null,
  },
  {
    id: 'tip.duration',
    placement: 'tip',
    location: 'src/content/health.ts → ipucu kutuları',
    title: 'Kullanım süresine dikkat',
    text: 'Burnu açan spreyleri önerilenden uzun süre kullanmak, tıkanıklığın daha şiddetli geri dönmesine yol açabilir. Kullanma talimatındaki süreye uyun.',
    approval: R,
    source: null,
  },
  {
    id: 'tip.doctor',
    placement: 'tip',
    location: 'src/content/health.ts → ipucu kutuları',
    title: 'Ne zaman doktora gitmeli?',
    text: '10 günü aşan, ateşle birlikte olan, göz çevresinde şişlik yapan ya da giderek kötüleşen şikâyetlerde bir doktora başvurun.',
    approval: R,
    source: null,
  },
  {
    id: 'tip.fluids',
    placement: 'tip',
    location: 'src/content/health.ts → ipucu kutuları',
    title: 'Bol su iç',
    text: 'Gün içinde bol su içmek ve burnu tuzlu suyla yıkamak, burundaki salgının akışkan kalmasına yardımcı olabilir.',
    approval: R,
    source: null,
  },
] as const satisfies readonly (HealthContent & { readonly title: string })[];

/** Çalışma anında kullanılan toast metinleri. */
export const HEALTH_TOASTS = {
  /** Sıklamen ilk kez kullanılabilir olduğunda (oyun başına bir kez). */
  cyclamenReady: {
    id: 'toast.cyclamen_ready',
    placement: 'toast',
    location: 'src/ui/hud.ts (updateHud)',
    text: 'Sinüslerin dolmaya başladı. Sıklamen özütü hazır.',
    approval: R,
    source: null,
  },
} as const satisfies Readonly<Record<string, HealthContent>>;

/**
 * Yerinde kalan statik metinler ve oyun içi sağlık metaforları (envanter). `location` kaynak dosyadır;
 * metin orada aynen bulunur (testle doğrulanır).
 */
export const HEALTH_STATIC = [
  {
    id: 'start.lead',
    placement: 'start_lead',
    location: 'index.html #scr-start .lead',
    text: 'Sinüslerini tıkayan blokları yerleştir, satırları temizle, nefesini aç.',
    approval: R,
    source: null,
  },
  {
    id: 'start.disclaimer',
    placement: 'start_disclaimer',
    location: 'index.html #scr-start .fine',
    text: 'Bu oyun bilgilendirme ve eğlence amaçlıdır; tıbbi tavsiye yerine geçmez. Şikâyetleriniz için hekiminize veya eczacınıza danışın.',
    approval: R,
    source: null,
  },
  {
    id: 'how.mucus',
    placement: 'how_to',
    location: 'index.html #scr-how .map li',
    text: 'Düşen bloklar burnunda biriken tıkanıklık; alan dolarsa sinüs tamamen tıkanır.',
    approval: R,
    source: null,
  },
  {
    id: 'how.rooms',
    placement: 'how_to',
    location: 'index.html #scr-how .map li',
    text: 'Oyun dört sinüs odasından geçer: yanak, gözler arası, alın ve kafa tabanı. Her oda gri bulutçuklarla başlar; parlayan boşlukları doldurup hepsini uçurunca sinüs açılır. Dördü de açılınca ister serbest nefese devam et, ister bitir.',
    approval: R,
    source: null,
  },
  {
    id: 'how.drain',
    placement: 'how_to',
    location: 'index.html #scr-how .map li',
    text: 'Bir satırı tamamen doldurunca satır silinir. Dört satırı birden silersen TETRİS. T bloğunu döndürüp dar bir boşluğa sokarsan T-spin: ekstra puan. Tahtayı tamamen boşaltırsan Tam Ferahlık bonusu.',
    approval: R,
    source: null,
  },
  {
    id: 'how.cyclamen',
    placement: 'how_to',
    location: 'index.html #scr-how .map li',
    text: 'Tıkanıklık yükselince iki destek açılır. Sıklamen özütü oyunda bir kez kullanılır, alt yarıyı yavaşça boşaltır ve 30 sn puanları ikiye katlar.',
    approval: R,
    source: null,
  },
  // NS4-24: 'how.synthetic' (sentetik açıcı / rebound) ve ilgili toast, buton, popup ve rozet metinleri kaldırıldı.
  {
    id: 'how.sneeze',
    placement: 'how_to',
    location: 'index.html #scr-how .map li',
    text: 'Hapşırık tıkanıklığın en üstteki 3 sırasını savurur. 20 blok yerleştirince yeniden dolar.',
    approval: R,
    source: null,
  },
  {
    id: 'over.title',
    placement: 'game_over',
    location: 'index.html #scr-over h2',
    text: 'Sinüslerin tamamen tıkandı',
    approval: R,
    source: null,
  },
  {
    id: 'over.health',
    placement: 'game_over',
    location: 'index.html #scr-over .health p',
    text: 'Gerçek hayatta tıkanıklıkla yaşamak zorunda değilsin. Sinüzit ve rahat nefes hakkında güvenilir bilgiler sağlık portalında.',
    approval: R,
    source: null,
  },
  {
    id: 'cta.over',
    placement: 'cta',
    location: 'index.html #cta-over',
    text: 'Rahat nefes rehberini aç',
    approval: R,
    source: null,
  },
  {
    id: 'cta.pause',
    placement: 'cta',
    location: 'index.html #cta-pause',
    text: 'Sinüs sağlığı rehberi',
    approval: R,
    source: null,
  },
  {
    id: 'popup.cyc_start',
    placement: 'popup',
    location: 'src/app/events.ts (clearstart cyc)',
    text: 'Alt satırlar temizleniyor',
    approval: R,
    source: null,
  },
  {
    id: 'popup.level',
    placement: 'popup',
    location: 'src/app/events.ts (levelup)',
    text: 'Bloklar hızlanıyor',
    approval: R,
    source: null,
  },
  {
    id: 'popup.tetris',
    placement: 'popup',
    location: 'src/app/events.ts (scored)',
    text: 'Dört satır birden!',
    approval: R,
    source: null,
  },
  {
    id: 'popup.tspin',
    placement: 'popup',
    location: 'src/app/events.ts (scored)',
    text: 'Usta hamle!',
    approval: R,
    source: null,
  },
] as const satisfies readonly HealthContent[];

/**
 * Bütün kayıtlar (denetim ve testler için). Fonksiyon olarak verilir: oyun kodu yalnızca ipuçlarını ve toast'ları
 * kullanır; envanter kayıtları (HEALTH_STATIC) production paketine girmez (tree-shaking).
 */
export function allHealthContent(): readonly HealthContent[] {
  return [...HEALTH_TIPS, ...Object.values(HEALTH_TOASTS), ...HEALTH_STATIC];
}
