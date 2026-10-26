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
   ===================================================================== */
import type { Settings } from '../types/settings';

/** unlock() ile oluşturulan temel ses grafiği. */
interface AudioGraph {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly sfx: GainNode;
  /** Müzik ana kanalı (kısma/ducking burada); oturum veri yolları buna bağlanır. */
  readonly mus: GainNode;
  /** NS4-20: müzik → muffle → master. Kesim frekansı tıkanıklığa göre (setCongestion). */
  readonly muffle: BiquadFilterNode;
  /** 2 sn'lik beyaz gürültü (nefes efektleri ve rüzgâr). */
  readonly noise: AudioBuffer;
}

type IntervalId = ReturnType<typeof window.setInterval>;
type AudioSettings = Readonly<Pick<Settings, 'sound' | 'music'>>;

/** Bir müzik oturumu: başlat → durdur arasında oluşturulan bütün düğümler. */
interface MusicSession {
  readonly bus: GainNode;
  readonly pad: BiquadFilterNode;
  /** Çalan kaynaklar (rüzgâr gürültüsü, LFO'lar, akor osilatörleri). */
  readonly sources: Set<AudioScheduledSourceNode>;
  readonly timer: IntervalId;
}

/** Ortam müziği hedef seviyesi (NS4-17: 0,32 → 0,26; oynanış sesleri öne çıkar). */
export const MUSIC_LEVEL = 0.26;
/** Müzik akor döngüsü (ms). */
export const MUSIC_CHORD_MS = 7000;
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

const CHORDS = [
  [220, 277.2, 329.6],
  [196, 246.9, 293.7],
  [174.6, 220, 261.6],
  [196, 246.9, 329.6],
] as const;

const noop = () => {};

export class Sound {
  private audio: AudioGraph | null = null;
  /** AudioContext oluşturulamadı (desteklenmiyor veya tarayıcı reddetti): ses olmadan devam edilir. */
  unsupported = false;
  /** Uygulama müzik istiyor mu (oyun sırasında true); ayarla birlikte değerlendirilir. */
  private wantMusic = false;
  private session: MusicSession | null = null;
  private chordIdx = 0;
  /** Sekme gizlenince bu sınıf context'i askıya aldıysa true (görünür olunca devam ettirilir). */
  private suspendedByHide = false;
  private lastMove = -1;
  private lastRotate = -1;
  /** NS4-20: son zamanlanan müzik süzgeci kesim frekansı. */
  private muffleHz = MUFFLE_OPEN_HZ;
  private readonly settings: AudioSettings; // NS4-03: ayar nesnesi dışarıdan verilir

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  /** Müzik oturumu açık mı. */
  get musicOn(): boolean {
    return this.session !== null;
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
      const muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = this.muffleHz;
      muffle.Q.value = 0.9;
      muffle.connect(master);
      const mus = ctx.createGain();
      mus.gain.value = 1;
      mus.connect(muffle);
      const len = ctx.sampleRate * 2,
        buf = ctx.createBuffer(1, len, ctx.sampleRate),
        d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.audio = { ctx, master, sfx, mus, muffle, noise: buf };
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
    if (!this.audio) return;
    this.audio.sfx.gain.value = this.settings.sound ? 1 : 0;
    if (this.settings.music && this.wantMusic) this.startMusic();
    else this.stopMusic();
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
    const hz = muffleCutoff(congestion);
    if (Math.abs(hz - this.muffleHz) / this.muffleHz < MUFFLE_MIN_STEP) return;
    this.muffleHz = hz;
    const a = this.audio;
    if (!a) return;
    const f = a.muffle.frequency;
    f.cancelScheduledValues(a.ctx.currentTime);
    f.setTargetAtTime(hz, a.ctx.currentTime, 0.18);
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
    this.breath(0.6, 260, 1400, 0.07, 0.8);
    this.breath(1.1, 1200, 300, 0.08, 0.7, 0.6);
    [392, 494, 587, 784, 988].forEach((f, i) => this.voice(f, 1.5, 0.035, 0.45 + i * 0.09, 0.2));
    [1568, 2093].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.02, 0, 0.9 + i * 0.08));
    this.duck(0.55, 1.6);
  }
  level() {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.05, 0, i * 0.07));
  }
  over() {
    this.tone(330, 0.7, 'triangle', 0.12, 82);
    this.breath(0.9, 900, 160, 0.06, 0.7);
  }

  // ---- ortam müziği ----
  startMusic(): void {
    const a = this.audio;
    if (!a || this.session) return;
    const ctx = a.ctx,
      t = ctx.currentTime;
    a.mus.gain.cancelScheduledValues(t);
    a.mus.gain.setValueAtTime(1, t);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.setTargetAtTime(MUSIC_LEVEL, t, 1.2);
    bus.connect(a.mus);
    const sources = new Set<AudioScheduledSourceNode>();
    // rüzgâr / nefes: filtrelenmiş gürültü + yavaş LFO
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
    for (const s of [n, lfo, lfo2]) {
      s.start(t);
      sources.add(s);
    }
    // yumuşak pad
    const pad = ctx.createBiquadFilter();
    pad.type = 'lowpass';
    pad.frequency.value = 900;
    pad.connect(bus);
    const play = () => {
      if (this.session?.bus !== bus) return;
      const c = CHORDS[this.chordIdx++ % CHORDS.length] ?? CHORDS[0],
        t0 = ctx.currentTime;
      for (const f of c) {
        for (let d = -1; d <= 1; d += 2) {
          const o = ctx.createOscillator(),
            g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          o.detune.value = d * 6;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(0.03, t0 + 2.5);
          g.gain.linearRampToValueAtTime(0.0001, t0 + 8.5);
          o.connect(g);
          g.connect(pad);
          o.onended = () => {
            sources.delete(o);
            g.disconnect();
          };
          o.start(t0);
          o.stop(t0 + 8.6);
          sources.add(o);
        }
      }
    };
    this.chordIdx = 0;
    this.session = { bus, pad, sources, timer: setInterval(play, MUSIC_CHORD_MS) };
    play();
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
  setMusic(want: boolean): void {
    this.wantMusic = want;
    this.applySettings();
  }
}
