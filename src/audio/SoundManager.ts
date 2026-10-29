/* =====================================================================
   AUDIO (WebAudio sentezi; harici dosya yok)
   NS4-03: main.ts'ten taşındı (sınıf adı Sound korundu). AudioContext yalnızca
   unlock() ile, kullanıcı etkileşiminde oluşturulur.
   DOM veya ayar paneline erişmez; ayarları constructor'dan alır.
   NS4-04: AudioContext'e bağlı düğümler tek bir `AudioGraph | null` alanında
   tutulur (unlock() öncesi gerçekten yoklar).
   NS4-17: miks dengesi ve yaşam döngüsü:
   - müzik her başlatmada kendi oturum veri yolunu (bus) kurar; durunca
     kaynaklar (gürültü, LFO, akor osilatörleri) durdurulur ve bağlantıları
     kesilir. Müzik kapalıyken çalışan düğüm kalmaz; tek zamanlayıcı vardır;
   - büyük anlarda (Tetris, T-spin, sıklamen, hapşırık) müzik kısa süre kısılır;
   - hareket/döndürme sesleri sık tekrarda seyreltilir ve kısılır;
   - AudioContext oluşturma/resume hataları yutulur (ses olmadan oyun sürer);
   - sekme gizlenince context askıya alınır, görünür olunca devam eder.
   NS4-20: tıkalı burun hissi: müzik kanalı bir alçak geçiren süzgeçten
   (muffle) geçer; tıkanıklık arttıkça müzik boğuklaşır, drenajla açılır.
   Oynanış sesleri süzülmez (geri bildirim net kalır).
   NS4-22: büyük açılma anı (Tetris, Tam Ferahlık, oda): süzgeç bir anda
   tamamen açılır, kısa süre açık kalır, sonra tıkanıklığa yavaşça döner;
   rahatlama "ahh"ı ünlü formantlı gürültüyle sentezlenir.
   NS4-39: iki müzik parçası (audio/music.ts): menü/mola/oyun sonu "Bahçe",
   oyun içi "Nefes". setMusic(mode) parçalar arasında yumuşak geçiş yapar;
   notalar 100 ms'lik ileri bakışlı tek zamanlayıcıyla planlanır. Menü
   müziği tıkanıklık süzgecinden ve kısmadan geçmez. Müzik ve efekt düzeyi
   ayardan (musicVol / sfxVol, 0..100) gelir.
   NS4-40: oyun müziği enerjik ve uyarlanır: tıkanıklık fazı (ferah / orta /
   tikali), oda (ton) ve seviye (tempo) ölçü başında okunur; davul (yumuşak
   kick, parmak şıklatma, shaker), bas, arpej ve melodi BarPlan'dan çalınır.
   ===================================================================== */
import type { Settings } from '../types/settings';
import {
  Melody,
  STEPS,
  TRACKS,
  eighth,
  gamePhase,
  planBar,
  type BarPlan,
  type GamePhase,
  type HitEv,
  type MusicKind,
  type NoteEv,
  type Track,
} from './music';

/** unlock() ile oluşturulan temel ses grafiği. */
interface AudioGraph {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly sfx: GainNode;
  /** NS4-39: müzik düzeyi (ayar): muffle ve menü veri yolu buna, bu master'a bağlanır. */
  readonly vol: GainNode;
  /** Oyun müziği kanalı (kısma/ducking burada); oyun oturumu veri yolu buna bağlanır. */
  readonly mus: GainNode;
  /** NS4-20: oyun müziği → muffle → vol → master. Kesim frekansı tıkanıklığa göre (setCongestion). */
  readonly muffle: BiquadFilterNode;
  /** 2 sn'lik beyaz gürültü (nefes efektleri ve rüzgâr). */
  readonly noise: AudioBuffer;
}

type IntervalId = ReturnType<typeof window.setInterval>;
/** NS4-39: menuMusic / musicVol / sfxVol verilmezse varsayılan (eski ayar nesneleri ve testler). */
type AudioSettings = Readonly<Pick<Settings, 'sound' | 'music'>> &
  Partial<Readonly<Pick<Settings, 'menuMusic' | 'musicVol' | 'sfxVol'>>>;

/** NS4-39: uygulamanın istediği müzik: yok, menü (ana menü, mola, oyun sonu) veya oyun. */
export type MusicMode = 'off' | MusicKind;

/** Bir müzik oturumu: başlat → durdur arasında oluşturulan bütün düğümler ve zamanlama durumu. */
interface MusicSession {
  readonly kind: MusicKind;
  readonly track: Track;
  readonly bus: GainNode;
  readonly pad: BiquadFilterNode;
  /** Çalan kaynaklar (rüzgâr gürültüsü, LFO'lar, pad / bas / melodi osilatörleri). */
  readonly sources: Set<AudioScheduledSourceNode>;
  readonly timer: IntervalId;
  readonly melody: Melody;
  /** Sıradaki 16'lığın context zamanı ve sırası (ölçü = STEPS adım). */
  next: number;
  step: number;
  /** Bu ölçünün planı ve 16'lık süresi (sn; tempo ölçü başında değişebilir). */
  plan: BarPlan | null;
  sixteenth: number;
  /** NS4-40: önceki ölçünün fazı ve ferah/orta döngüsünün başladığı ölçü. */
  phase: GamePhase;
  cycleStart: number;
}

/** Ses düzeyi ayarlarının varsayılanı (bu düzeyde kazanç 1: NS4-39 öncesi miks korunur). */
export const DEFAULT_MUSIC_VOL = 70;
export const DEFAULT_SFX_VOL = 80;
/** NS4-39: ayar (0..100) → kazanç. Kulağa doğrusal gelsin diye kare eğri; varsayılan düzeyde 1. */
export function volumeGain(v: number, ref: number): number {
  const k = Math.max(0, Math.min(100, v)) / ref;
  return k * k;
}
/** Oyun müziği hedef seviyesi (NS4-17: 0,32 → 0,26; oynanış sesleri öne çıkar). */
export const MUSIC_LEVEL = TRACKS.game.level;
/** NS4-39: nota zamanlayıcısının aralığı (ms) ve ileri bakış süresi (sn). */
export const MUSIC_TICK_MS = 100;
const MUSIC_LOOKAHEAD = 0.3;
/** Hareket/döndürme sesleri arasındaki en kısa aralık (sn); daha sık tekrarlar çalınmaz. */
export const MOVE_MIN_GAP = 0.05;
const ROTATE_MIN_GAP = 0.045;
/** Durdurulan müziğin söndükten sonra kaynaklarının durdurulduğu süre (sn). */
const MUSIC_RELEASE = 1.4;

/** NS4-20: tıkanıklık bu orana kadar müzik açık kalır; üstünde boğuklaşır. */
export const MUFFLE_START = 0.3;
/** Açık ve tamamen tıkalı durumda müzik süzgecinin kesim frekansı (Hz). */
export const MUFFLE_OPEN_HZ = 16000;
export const MUFFLE_CLOSED_HZ = 520;
/** Kesim frekansı bu orandan az değişirse yeniden zamanlanmaz (her karede çağrılır). */
const MUFFLE_MIN_STEP = 0.03;
/** Süzgeç zaman sabitleri (sn): normal izleme, açılma anı (anlık) ve açılma sonrası yavaş geri dönüş. */
const MUFFLE_TC = 0.18;
const OPEN_TC = 0.03;
const RECLOSE_TC = 0.7;
/** NS4-22: açılma anında süzgecin açık kaldığı süre (sn). Oda: "Sinüs açıldı" geçişi (2,4 sn) + yeni odaya giriş. */
export const OPEN_HOLD = { tetris: 1.2, allclear: 2.2, room: 2.8 } as const;
/** NS4-22: "ahh" ünlüsünün iki formantı (/a/; başlangıç → bitiş Hz, Q). Perde rahatlarken hafifçe düşer. */
/** NS4-38: "Sıradaki" açılış sesleri her parçada çalar: tık hareket sesi (0,026) düzeyinde, çan ondan az üstte. */
export const REVEAL_TICK_GAIN = 0.02;
export const REVEAL_CHIME_GAIN = 0.022;
const SIGH_FORMANTS = [
  [850, 700, 5],
  [1300, 1100, 6],
] as const;

/**
 * Tıkanıklık (0..1) → müzik süzgecinin kesim frekansı. MUFFLE_START altında açık; üstünde üstel (kulağa
 * doğrusal gelen) bir eğriyle MUFFLE_CLOSED_HZ'e iner.
 */
export function muffleCutoff(congestion: number): number {
  const c = Math.min(1, Math.max(0, congestion));
  if (c <= MUFFLE_START) return MUFFLE_OPEN_HZ;
  const k = (c - MUFFLE_START) / (1 - MUFFLE_START);
  return MUFFLE_OPEN_HZ * Math.pow(MUFFLE_CLOSED_HZ / MUFFLE_OPEN_HZ, k);
}

const noop = () => {};

export class Sound {
  private audio: AudioGraph | null = null;
  /** AudioContext oluşturulamadı (desteklenmiyor veya tarayıcı reddetti): ses olmadan devam edilir. */
  unsupported = false;
  /** NS4-39: uygulamanın istediği müzik; ayarla birlikte değerlendirilir. */
  private mode: MusicMode = 'off';
  /** Sıradaki başlatmada müziğin girişi bu kadar gecikir (sn; oyun sonu sesi önce duyulsun). */
  private startDelay = 0;
  private session: MusicSession | null = null;
  /** NS4-40: oyun müziği fazı (tıkanıklıktan, gecikmeli) ve bağlam (seviye → tempo, oda → ton). */
  private phase: GamePhase = 'ferah';
  private musicLevel = 1;
  private musicRoom = 0;
  /** Sekme gizlenince bu sınıf context'i askıya aldıysa true (görünür olunca devam ettirilir). */
  private suspendedByHide = false;
  private lastMove = -1;
  private lastRotate = -1;
  private lastPreview = -1;
  /** NS4-20: son zamanlanan müzik süzgeci kesim frekansı. */
  private muffleHz = MUFFLE_OPEN_HZ;
  /** NS4-22: süzgeç bu context zamanına kadar açık tutulur; sonraki ilk izleme yavaş geri döner. */
  private openUntil = -1;
  private reclose = false;
  private readonly settings: AudioSettings; // NS4-03: ayar nesnesi dışarıdan verilir

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  /** Müzik oturumu açık mı. */
  get musicOn(): boolean {
    return this.session !== null;
  }
  /** NS4-40: oyun müziğinin şu anki fazı (tıkanıklığa göre). */
  get musicPhase(): GamePhase {
    return this.phase;
  }
  /** NS4-39: çalan parça (yoksa 'off'). */
  get musicKind(): MusicMode {
    return this.session?.kind ?? 'off';
  }
  /** AudioContext oluşturuldu mu (yalnızca kullanıcı etkileşiminden sonra). */
  get unlocked(): boolean {
    return this.audio !== null;
  }
  /** Çalan müzik kaynağı sayısı (tanı/test; müzik kapalıyken 0). */
  get musicSourceCount(): number {
    return this.session?.sources.size ?? 0;
  }
  get contextState(): AudioContextState | 'none' {
    return this.audio ? this.audio.ctx.state : 'none';
  }

  /** Kullanıcı etkileşiminde çağrılır: ilk çağrıda grafiği kurar, askıdaki context'i sürdürür. */
  unlock(): void {
    if (!this.audio) {
      if (this.unsupported) return;
      const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : undefined;
      if (!AC) {
        this.unsupported = true;
        return;
      }
      let ctx: AudioContext;
      try {
        ctx = new AC();
      } catch {
        this.unsupported = true; // ör. context sınırı / politika: oyun sessiz sürer
        return;
      }
      const master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      const sfx = ctx.createGain();
      sfx.connect(master);
      const vol = ctx.createGain();
      vol.connect(master);
      const muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = this.muffleHz;
      muffle.Q.value = 0.9;
      muffle.connect(vol);
      const mus = ctx.createGain();
      mus.gain.value = 1;
      mus.connect(muffle);
      const len = ctx.sampleRate * 2,
        buf = ctx.createBuffer(1, len, ctx.sampleRate),
        d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.audio = { ctx, master, sfx, vol, mus, muffle, noise: buf };
      this.applySettings();
    }
    this.suspendedByHide = false;
    this.resumeContext();
  }
  private resumeContext(): void {
    const ctx = this.audio?.ctx;
    // resume() reddedilirse tarayıcı sesi kapalı tutar; bir sonraki etkileşimde yeniden denenir
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(noop);
  }
  /** NS4-17: sekme gizlenince context askıya alınır (çalan kuyruk/tail kalmaz); görünür olunca sürer. */
  setHidden(hidden: boolean): void {
    const ctx = this.audio?.ctx;
    if (!ctx) return;
    if (hidden) {
      if (ctx.state === 'running') {
        this.suspendedByHide = true;
        ctx.suspend().catch(noop);
      }
    } else if (this.suspendedByHide) {
      this.suspendedByHide = false;
      this.resumeContext();
    }
  }
  applySettings(): void {
    const a = this.audio;
    if (!a) return;
    const st = this.settings;
    a.sfx.gain.value = st.sound ? volumeGain(st.sfxVol ?? DEFAULT_SFX_VOL, DEFAULT_SFX_VOL) : 0;
    // kaydırıcı sürüklenirken tıkırtı olmasın diye kısa yumuşatma
    const mv = st.musicVol ?? DEFAULT_MUSIC_VOL;
    a.vol.gain.setTargetAtTime(volumeGain(mv, DEFAULT_MUSIC_VOL), a.ctx.currentTime, 0.05);
    const want: MusicMode =
      !st.music || mv <= 0 || (this.mode === 'menu' && st.menuMusic === false) ? 'off' : this.mode;
    if (want === 'off') this.stopMusic();
    else this.startMusic(want);
  }

  // ---- sentez yardımcıları ----
  private sfxReady(): AudioGraph | null {
    const a = this.audio;
    return a && this.settings.sound ? a : null;
  }
  tone(f: number, dur: number, type: OscillatorType, gain: number, f2?: number, delay?: number): void {
    const a = this.sfxReady();
    if (!a) return;
    const t = a.ctx.currentTime + (delay || 0);
    const o = a.ctx.createOscillator(),
      g = a.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(a.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  /** Yumuşak girişli ton (akor/pad): doğrusal atak, üstel sönüm. */
  voice(f: number, dur: number, gain: number, delay = 0, attack = 0.08, type: OscillatorType = 'sine'): void {
    const a = this.sfxReady();
    if (!a) return;
    const t = a.ctx.currentTime + delay;
    const o = a.ctx.createOscillator(),
      g = a.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(a.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  breath(dur: number, f0: number, f1: number, gain: number, q?: number, delay?: number): void {
    const a = this.sfxReady();
    if (!a) return;
    const t = a.ctx.currentTime + (delay || 0);
    const s = a.ctx.createBufferSource();
    s.buffer = a.noise;
    const bp = a.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q || 1;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp);
    bp.connect(g);
    g.connect(a.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }
  /**
   * NS4-22: rahatlama "ahh"ı: gürültü /a/ ünlüsünün iki formantından geçer (perde hafifçe düşer), yumuşak girip
   * uzun söner. Islak veya burun sesi yok; nefes verme gibi. `dur` ≤ 1,5 sn (gürültü tamponu 2 sn).
   */
  sigh(dur: number, gain: number, delay = 0): void {
    const a = this.sfxReady();
    if (!a) return;
    const t = a.ctx.currentTime + delay;
    const s = a.ctx.createBufferSource();
    s.buffer = a.noise;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f0, f1, q] of SIGH_FORMANTS) {
      const bp = a.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
      s.connect(bp);
      bp.connect(g);
    }
    g.connect(a.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }
  /** Müziği kısa süre kısar (büyük ses anlarında oynanış sesi öne çıkar). Müzik yoksa etkisizdir. */
  duck(depth: number, hold: number): void {
    const a = this.audio;
    if (!a || !this.session) return;
    const t = a.ctx.currentTime,
      g = a.mus.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(1 - depth, t, 0.04);
    g.setTargetAtTime(1, t + hold, 0.35);
  }

  /**
   * NS4-20: tıkanıklığa göre müziği boğuklaştırır (her karede çağrılabilir; küçük değişimler atlanır).
   * unlock() öncesi çağrılırsa değer saklanır ve grafik kurulurken uygulanır.
   */
  setCongestion(congestion: number): void {
    this.phase = gamePhase(congestion, this.phase); // NS4-40: müzik ölçü başında okur
    const a = this.audio;
    if (a && a.ctx.currentTime < this.openUntil) return; // NS4-22: açılma anı sürüyor
    const hz = muffleCutoff(congestion);
    if (Math.abs(hz - this.muffleHz) / this.muffleHz < MUFFLE_MIN_STEP) {
      this.reclose = false; // açılma sonrası tıkanıklık zaten düşük: yavaş dönüşe gerek kalmadı
      return;
    }
    this.muffleHz = hz;
    if (!a) return;
    const f = a.muffle.frequency;
    f.cancelScheduledValues(a.ctx.currentTime);
    f.setTargetAtTime(hz, a.ctx.currentTime, this.reclose ? RECLOSE_TC : MUFFLE_TC);
    this.reclose = false;
  }
  /**
   * NS4-22: büyük açılma anı: müzik süzgeci bir anda tamamen açılır ve `hold` sn açık kalır (setCongestion bu sürede
   * yok sayılır); sonra tıkanıklığa yavaşça döner. unlock() öncesi etkisizdir.
   */
  openUp(hold: number): void {
    const a = this.audio;
    if (!a) return;
    const t = a.ctx.currentTime,
      f = a.muffle.frequency;
    f.cancelScheduledValues(t);
    f.setTargetAtTime(MUFFLE_OPEN_HZ, t, OPEN_TC);
    this.muffleHz = MUFFLE_OPEN_HZ;
    this.openUntil = Math.max(this.openUntil, t + hold);
    this.reclose = true;
  }
  /** Müzik süzgecinin hedef kesim frekansı (tanı/test). */
  get muffleTarget(): number {
    return this.muffleHz;
  }

  // ---- olay sesleri ----
  /** Sık tekrarda seyreltilir (DAS/ARR); art arda gelenler biraz daha kısık çalınır. */
  move() {
    const a = this.sfxReady();
    if (!a) return;
    const now = a.ctx.currentTime;
    if (this.lastMove >= 0 && now - this.lastMove < MOVE_MIN_GAP) return;
    const rapid = this.lastMove >= 0 && now - this.lastMove < 0.14;
    this.lastMove = now;
    this.tone(520, 0.03, 'sine', rapid ? 0.018 : 0.026);
  }
  rotate() {
    const a = this.sfxReady();
    if (!a) return;
    const now = a.ctx.currentTime;
    if (this.lastRotate >= 0 && now - this.lastRotate < ROTATE_MIN_GAP) return;
    const rapid = this.lastRotate >= 0 && now - this.lastRotate < 0.16;
    this.lastRotate = now;
    this.tone(640, 0.05, 'triangle', rapid ? 0.026 : 0.036, 820);
  }
  hold() {
    this.tone(420, 0.08, 'sine', 0.05, 300);
  }
  /** Yerçekimiyle oturma: kısa, yumuşak "tok". */
  lock() {
    this.tone(170, 0.08, 'sine', 0.11, 110);
  }
  /** Hard drop: daha derin ve uzun darbe + aşağı inen hava sesi (lock sesi ayrıca çalınmaz, bkz. events.ts). */
  hard() {
    this.tone(110, 0.17, 'sine', 0.22, 42);
    this.breath(0.1, 1600, 260, 0.07, 0.8);
  }
  /** Satır temizleme. Normal drenaj: nefes + damlalar; Tetris: açılan akor; T-spin: parlak, hızlı arpej. */
  clear(n: number, tspin: number) {
    if (tspin) {
      // Nörorefleks: kısa nefes, hızlı yükselen arpej ve yüksek kıvılcım tınıları
      if (n > 0) this.breath(0.22 + 0.06 * n, 500, 1600, 0.06, 1.4);
      const arp = n > 0 ? [880, 1175, 1480, 1760] : [880, 1175];
      arp.forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.042, 0, 0.02 + i * 0.035));
      for (let i = 0; i < (n > 0 ? 3 : 1); i++) this.tone(2637, 0.06, 'sine', 0.02, 0, 0.16 + i * 0.05);
      if (n > 0) {
        this.tone(220, 0.18, 'triangle', 0.045, 440, 0.02);
        this.duck(0.35, 0.6);
      }
      return;
    }
    // içeri derin nefes + damlacıklar
    this.breath(0.34 + 0.1 * n, 300, 1200 + 300 * n, 0.08 + 0.02 * n, 1.1);
    for (let i = 0; i < 2 + n * 2; i++) this.tone(800 + Math.random() * 700, 0.09, 'sine', 0.04, 260, 0.06 + i * 0.045);
    if (n >= 4) {
      // Ozmotik etki: yavaş açılan geniş akor
      [523, 659, 784, 1047].forEach((f, i) => this.voice(f, 1.0, 0.045, 0.1 + i * 0.04, 0.12));
      this.duck(0.45, 0.9);
    }
  }
  /** Sıklamen: en yumuşak ve ferah an — uzun, düşük kazançlı nefes, seyrek damlalar, yavaş açılan akor. */
  cyc() {
    this.breath(1.4, 220, 1800, 0.07, 0.7);
    for (let i = 0; i < 8; i++) this.tone(600 + Math.random() * 600, 0.14, 'sine', 0.022, 1000, 0.15 + i * 0.09);
    [392, 523, 659, 784].forEach((f, i) => this.voice(f, 1.6, 0.03, 0.25 + i * 0.1, 0.35));
    this.duck(0.5, 1.4);
  }
  /**
   * NS4-24: Hapşırık: iki yükselen "ha…" nefesi ve tonu, ardından geniş, kısa "HAPŞU" (gürültü patlaması + tok
   * darbe) ve neşeli bir "boing" ile parıltılar. Islak/burun sesi yok; çizgi film tınısı. Zamanlama, görseldeki
   * hazırlık evresiyle (SNEEZE_FX.windup × CFG.sneezeMs ≈ 0,29 sn) örtüşür.
   */
  sneeze() {
    this.breath(0.16, 400, 1100, 0.05, 1.2);
    this.tone(392, 0.14, 'triangle', 0.03, 523);
    this.breath(0.18, 500, 1500, 0.07, 1.2, 0.15);
    this.tone(523, 0.16, 'triangle', 0.035, 698, 0.15);
    this.breath(0.3, 3800, 900, 0.16, 0.6, 0.3);
    this.tone(150, 0.2, 'sine', 0.16, 70, 0.3);
    this.tone(330, 0.32, 'sine', 0.05, 660, 0.4);
    [1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.08, 'sine', 0.02, 0, 0.46 + i * 0.05));
    this.duck(0.45, 0.7);
  }
  /**
   * NS4-27: "Sinüs açıldı": derin içe nefes, ardından rahat bir dışa "ahh" nefesi ve yavaş açılan majör akor;
   * müzik kısılır (tıkalı burun süzgeci de tıkanıklık düşünce kendiliğinden açılır).
   */
  roomClear() {
    this.openUp(OPEN_HOLD.room); // NS4-22: süzgeç bir anda açılır, yeni odaya kadar açık kalır
    this.breath(0.6, 260, 1400, 0.07, 0.8);
    this.sigh(1.2, 0.1, 0.55);
    [392, 494, 587, 784, 988].forEach((f, i) => this.voice(f, 1.5, 0.035, 0.45 + i * 0.09, 0.2));
    [1568, 2093].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.02, 0, 0.9 + i * 0.08));
    this.duck(0.55, 1.6);
  }
  /**
   * NS4-22: büyük açılma anı. Tetris: satır sesi (clear(4)) zaten akoru çalar; burada süzgeç açılır ve hafif bir
   * "ahh" eklenir. Tam Ferahlık: derin içe nefes, uzun "ahh", parlak açılan akor ve aşağı süzülen parıltılar.
   */
  relief(kind: 'tetris' | 'allclear') {
    this.openUp(OPEN_HOLD[kind]);
    if (kind === 'tetris') {
      this.sigh(0.9, 0.06, 0.15);
      return;
    }
    this.breath(0.45, 260, 1400, 0.06, 0.8);
    this.sigh(1.4, 0.11, 0.4);
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.voice(f, 1.8, 0.034, 0.35 + i * 0.08, 0.18));
    [2637, 2349, 2093, 1760, 1568, 1319].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.018, 0, 0.7 + i * 0.07));
    this.duck(0.6, 2);
  }
  /**
   * NS4-38: "Sıradaki" gizem kartının tıkı: kasa açma çarkı gibi, ama yumuşak. Kısa, kısık bir plastik "tık"
   * (dar bantlı gürültü + kısa üçgen ton); her tık biraz pesleşir ve kısılır (çark yavaşlıyor). Her parçada çaldığı
   * için hareket sesinden kısık tutulur; perde hafifçe rastgele (tekrar yorgunluğu olmasın).
   */
  revealTick(i: number) {
    const k = Math.min(i, 3),
      j = 1 + (Math.random() - 0.5) * 0.06;
    this.breath(0.026, 3400 * j, 2600 * j, REVEAL_TICK_GAIN * (1 - k * 0.12), 5);
    this.tone((1900 - k * 140) * j, 0.024, 'triangle', REVEAL_TICK_GAIN * 0.8 * (1 - k * 0.15));
  }
  /** NS4-38: kart açılınca hafif çan (iki sinüs kısmisi, kısa kuyruk). Hızlı oyunda daha kısık ve kısa. */
  revealChime(fast: boolean) {
    const g = fast ? REVEAL_CHIME_GAIN * 0.55 : REVEAL_CHIME_GAIN;
    const d = fast ? 0.16 : 0.3;
    this.tone(1319, d, 'sine', g);
    this.tone(1976, d * 0.8, 'sine', g * 0.6, 0, 0.035);
  }
  /** NS4-39: efekt düzeyi kaydırıcısı sürüklenirken örnek ses (çan); sık tekrarda seyreltilir. */
  preview() {
    const a = this.sfxReady();
    if (!a) return;
    const now = a.ctx.currentTime;
    if (now - this.lastPreview < 0.15) return;
    this.lastPreview = now;
    this.revealChime(false);
  }
  level() {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.05, 0, i * 0.07));
  }
  over() {
    this.tone(330, 0.7, 'triangle', 0.12, 82);
    this.breath(0.9, 900, 160, 0.06, 0.7);
  }

  // ---- müzik (NS4-39: iki parça, ileri bakışlı nota zamanlayıcısı) ----
  /** `kind` parçasını başlatır; başka parça çalıyorsa o söner (yumuşak geçiş). Aynı parça yeniden başlamaz. */
  startMusic(kind: MusicKind = 'game'): void {
    const a = this.audio;
    if (!a) return;
    if (this.session?.kind === kind) return;
    this.stopMusic();
    const ctx = a.ctx,
      t = ctx.currentTime,
      track = TRACKS[kind],
      delay = this.startDelay;
    this.startDelay = 0;
    if (kind === 'game') {
      a.mus.gain.cancelScheduledValues(t);
      a.mus.gain.setValueAtTime(1, t);
    }
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.setTargetAtTime(track.level, t + delay, 1.2);
    // menü müziği tıkanıklık süzgecinden ve kısmadan geçmez
    bus.connect(kind === 'game' ? a.mus : a.vol);
    const sources = new Set<AudioScheduledSourceNode>();
    if (track.wind) this.wind(a, bus, sources, t);
    const pad = ctx.createBiquadFilter();
    pad.type = 'lowpass';
    pad.frequency.value = track.padCutoff;
    pad.connect(bus);
    const s: MusicSession = {
      kind,
      track,
      bus,
      pad,
      sources,
      melody: new Melody(track),
      next: t + 0.1 + delay,
      step: 0,
      plan: null,
      sixteenth: eighth(track.bpm) / 2,
      phase: this.phase,
      cycleStart: 0,
      timer: setInterval(() => this.schedule(s), MUSIC_TICK_MS),
    };
    this.session = s;
    this.schedule(s);
  }

  /** Rüzgâr / nefes: filtrelenmiş gürültü + yavaş LFO'lar (oyun parçası). */
  private wind(a: AudioGraph, bus: GainNode, sources: Set<AudioScheduledSourceNode>, t: number): void {
    const ctx = a.ctx;
    const n = ctx.createBufferSource();
    n.buffer = a.noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg);
    lg.connect(bp.frequency);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.07;
    const lg2 = ctx.createGain();
    lg2.gain.value = 0.035;
    lfo2.connect(lg2);
    lg2.connect(ng.gain);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    for (const src of [n, lfo, lfo2]) {
      src.start(t);
      sources.add(src);
    }
  }

  /**
   * İleri bakış penceresine giren 16'lıkları planlar. Ölçü başında faz, oda ve seviye okunur ve ölçünün planı
   * (BarPlan) üretilir; faz değişiminden sonra ferah/orta dönüşünde döngü nakarattan başlar (rahatlama).
   */
  private schedule(s: MusicSession): void {
    const a = this.audio;
    if (!a || this.session !== s) return;
    while (s.next < a.ctx.currentTime + MUSIC_LOOKAHEAD) {
      const t = s.next,
        step = s.step % STEPS,
        bar = Math.floor(s.step / STEPS);
      if (step === 0 || !s.plan) {
        const phase = s.kind === 'game' ? this.phase : 'ferah';
        if (s.phase === 'tikali' && phase !== 'tikali') s.cycleStart = bar - 8; // rahatlama: doğrudan nakarat
        s.plan = planBar(
          {
            kind: s.kind,
            bar,
            cycleBar: bar - s.cycleStart,
            phase,
            prevPhase: s.phase,
            level: this.musicLevel,
            room: this.musicRoom,
          },
          s.melody,
        );
        s.phase = phase;
        s.sixteenth = eighth(s.plan.bpm) / 2;
        this.renderBarStart(s, s.plan, t);
      }
      this.renderStep(s, s.plan, step, t);
      s.step++;
      s.next += s.sixteenth;
    }
  }

  /** Ölçü başı: pad akoru ve faz geçişi süsü. */
  private renderBarStart(s: MusicSession, p: BarPlan, t: number): void {
    if (p.pad) this.padChord(s, p.pad.chord, t, p.pad.bars * STEPS * s.sixteenth);
    if (p.fill === 'tense') {
      // gerilime iniş: derin, yumuşak "dum" (kaybetmeye yaklaşılıyor)
      this.musicNote(s, 90, t, 0.9, 0.22, 0.01, 0, 38);
    } else if (p.fill === 'relief') {
      // rahatlama: hızlı yükselen neşeli arpej
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.musicNote(s, f, t + i * 0.06, 0.4, 0.05, 0.005, 0.15));
    }
  }

  /** Bir 16'lığın olayları (plan sabit adımlıdır; bir adımda birden çok katman çalabilir). */
  private renderStep(s: MusicSession, p: BarPlan, step: number, t: number): void {
    const at = <T extends { step: number }>(xs: readonly T[]) => xs.filter((x) => x.step === step);
    const len = (n: NoteEv) => n.len * s.sixteenth;
    for (const n of at(p.bass))
      this.musicNote(s, n.f, t, Math.max(0.16, len(n) * 1.1), n.gain, 0.012, 0.12, 0, 'triangle');
    // kalimba/marimba: temel + yumuşak oktav kısmisi, hızlı atak, uzun sönüm
    for (const n of at(p.melody)) this.musicNote(s, n.f, t, Math.max(0.5, len(n) * 1.6), n.gain, 0.005, 0.2);
    for (const n of at(p.arp)) this.musicNote(s, n.f, t, 0.14, n.gain, 0.004, 0);
    for (const h of at(p.kick)) this.kick(s, t, h);
    for (const h of at(p.snap)) this.noiseHit(s, t, h.gain, 'bandpass', 1900, 0.9, 0.09);
    // shaker: tiz gürültü ama yumuşak (sert hi-hat değil); swing için tek 16'lıklar biraz geç
    for (const h of at(p.hat))
      this.noiseHit(s, t + (step % 2 ? s.sixteenth * 0.12 : 0), h.gain, 'bandpass', 6500, 1.2, 0.04);
  }

  /** Yumuşak kick: perdesi hızla düşen sinüs (gümleme yok, kısa). */
  private kick(s: MusicSession, t: number, h: HitEv): void {
    this.musicNote(s, 120, t, 0.2, h.gain, 0.003, 0, 46);
  }

  /** Gürültü vuruşu (parmak şıklatma / shaker): süzülmüş kısa gürültü. */
  private noiseHit(
    s: MusicSession,
    t: number,
    gain: number,
    type: BiquadFilterType,
    hz: number,
    q: number,
    dur: number,
  ) {
    const a = this.audio!;
    const src = a.ctx.createBufferSource();
    src.buffer = a.noise;
    const f = a.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(s.bus);
    src.onended = () => {
      s.sources.delete(src);
      f.disconnect();
      g.disconnect();
    };
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
    s.sources.add(src);
  }

  /** Akor: her nota iki hafif ayrık sinüs; yavaş girer, bir sonraki akorla örtüşerek söner. */
  private padChord(s: MusicSession, chord: readonly number[], t: number, dur: number): void {
    const ctx = this.audio!.ctx;
    for (const f of chord)
      for (let d = -1; d <= 1; d += 2) {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        o.detune.value = d * 6;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(s.track.padGain, t + Math.min(1.6, dur * 0.4));
        g.gain.linearRampToValueAtTime(s.track.padGain * 0.7, t + dur);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
        this.musicSource(s, o, g, s.pad, t, t + dur + 1.3);
      }
  }

  /**
   * Tek nota. `harm`: oktav kısmisinin kazanç oranı (0 = yok); `glide`: perde bu frekansa iner (kick, iniş süsü);
   * `type`: dalga biçimi (bas üçgen, diğerleri sinüs).
   */
  private musicNote(
    s: MusicSession,
    f: number,
    t: number,
    dur: number,
    gain: number,
    attack: number,
    harm: number,
    glide = 0,
    type: OscillatorType = 'sine',
  ) {
    const ctx = this.audio!.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (glide > 0) o.frequency.exponentialRampToValueAtTime(glide, t + dur * 0.6);
    this.musicSource(s, o, g, s.bus, t, t + dur + 0.05);
    if (harm > 0) {
      const o2 = ctx.createOscillator(),
        g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.value = f * 2;
      g2.gain.value = harm;
      this.musicSource(s, o2, g2, g, t, t + dur + 0.05);
    }
  }

  /** Osilatörü kazanca, kazancı hedefe bağlar; oturuma kaydeder, bitince kaydı silinir ve kazanç ayrılır. */
  private musicSource(s: MusicSession, o: OscillatorNode, g: GainNode, to: AudioNode, t0: number, t1: number) {
    o.connect(g);
    g.connect(to);
    o.onended = () => {
      s.sources.delete(o);
      g.disconnect();
    };
    o.start(t0);
    o.stop(t1);
    s.sources.add(o);
  }

  stopMusic(): void {
    const a = this.audio,
      s = this.session;
    if (!a || !s) return;
    this.session = null;
    clearInterval(s.timer);
    const t = a.ctx.currentTime;
    s.bus.gain.cancelScheduledValues(t);
    s.bus.gain.setTargetAtTime(0, t, 0.35);
    // sönümden sonra bütün kaynaklar durur, oturum veri yolu ayrılır (müzik kapalıyken çalışan düğüm kalmaz)
    for (const src of s.sources) {
      try {
        src.stop(t + MUSIC_RELEASE);
      } catch {
        /* zaten durdurulmuş */
      }
    }
    const release = setTimeout(
      () => {
        s.sources.clear();
        s.pad.disconnect();
        s.bus.disconnect();
      },
      MUSIC_RELEASE * 1000 + 100,
    );
    // Node/test ortamında süreci tutmaz
    (release as { unref?: () => void }).unref?.();
  }
  /**
   * NS4-39: uygulamanın istediği müzik. 'menu': ana menü, mola, oyun sonu; 'game': oyun; 'off': sessiz.
   * `delay` (sn): yeni parçanın girişi gecikir (ör. oyun sonu sesi önce duyulsun). Ayar kapalıysa çalmaz.
   */
  /** NS4-40: oyun müziği bağlamı (her karede çağrılabilir; ölçü başında okunur). */
  setMusicContext(level: number, room: number): void {
    this.musicLevel = level;
    this.musicRoom = room;
  }
  setMusic(mode: MusicMode, delay = 0): void {
    this.mode = mode;
    this.startDelay = delay;
    this.applySettings();
    this.startDelay = 0;
  }
}
