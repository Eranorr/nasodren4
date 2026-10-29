/* =====================================================================
   NS4-39 / NS4-40: müzik besteleri (WebAudio sentezi için nota verisi; ses
   dosyası yok). Bu modül saftır: her ölçünün planını (BarPlan) üretir;
   zamanlama ve sentez SoundManager'dadır.
   - menu "Bahçe": ana menü, mola, oyun sonu. Yavaş, sıcak, davulsuz.
   - game "Nefes" (NS4-40: enerjik ve eğlenceli, uyarlanır):
     · ferah  (tıkanıklık düşük): Do majör I–V–vi–IV, zıplayan bas, yumuşak
       kick / parmak şıklatma / shaker, marimba melodisi;
     · orta   (%35+): aynı akorlar, 16'lık shaker, arpej; enerji yükselir;
     · tikali (%70+, kaybetmeye yakın): müzik biçim değiştirir. La minör
       Lam–Fa–Rem–Mi gerilimi, kalp atışı kick, sürüklenen 8'lik bas,
       gergin 16'lık arpej; melodi susar. Tıkanıklık düşünce neşeli
       "rahatlama" geçişiyle nakarata döner.
   Uzun oyunda can sıkmasın diye:
     · 24 ölçülük döngü: giriş (8) · nakarat (8, melodi) · ara (4, davul
       yok) · yükseliş (4); doku sürekli değişir;
     · melodi motifleri her 8 ölçüde yenilenir, pentatonik ve pes (oyun
       seslerinin altında); davullar yumuşak, tiz ve sert vuruş yok;
     · her sinüs odasında ton değişir, seviye arttıkça tempo hafifçe artar.
   ===================================================================== */

export type MusicKind = 'menu' | 'game';
/** NS4-40: oyun müziğinin fazı (tıkanıklığa göre, eşiklerde gecikmeli geçiş). */
export type GamePhase = 'ferah' | 'orta' | 'tikali';
/** NS4-40: 24 ölçülük döngünün bölümü (ferah/orta). Gergin fazda bölüm yoktur ('tense'). */
export type Section = 'intro' | 'chorus' | 'break' | 'build' | 'tense' | 'calm';

/** Ölçü başına 16'lık adım sayısı (zamanlama ızgarası). */
export const STEPS = 16;

export interface Track {
  /** Temel tempo (dörtlük/dk). */
  readonly bpm: number;
  /** Oturum veri yolunun hedef düzeyi. */
  readonly level: number;
  /** Melodi dizisi (Hz, pentatonik, pesten tize). */
  readonly scale: readonly number[];
  /** Sekizlik başına melodi notası olasılığı (motif üretimi). */
  readonly density: number;
  readonly padGain: number;
  readonly padCutoff: number;
  /** Filtrelenmiş gürültü rüzgârı (yalnızca oyun). */
  readonly wind: boolean;
}

export const TRACKS: Readonly<Record<MusicKind, Track>> = {
  // Fa majör; melodi Fa pentatonik
  menu: {
    bpm: 72,
    level: 0.24,
    scale: [349.2, 392, 440, 523.3, 587.3, 698.5, 784, 880, 1046.5],
    density: 0.42,
    padGain: 0.026,
    padCutoff: 1100,
    wind: false,
  },
  // Do majör; melodi Do pentatonik (Do4–Sol5, oyun seslerinin altında)
  game: {
    bpm: 108,
    level: 0.26,
    scale: [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3, 784],
    density: 0.45,
    padGain: 0.016,
    padCutoff: 1400,
    wind: true,
  },
};

/** Akorlar (Hz, pesten tize; ilk nota kök). Her akor 2 ölçü sürer. */
const MENU_CHORDS = [
  [174.6, 220, 261.6, 329.6], // Fmaj7
  [146.8, 174.6, 220, 261.6], // Rem7
  [116.5, 146.8, 174.6, 220], // Si♭maj7
  [130.8, 196, 220, 261.6], // Do6
] as const;
const BRIGHT_CHORDS = [
  [130.8, 164.8, 196, 246.9], // Domaj7
  [196, 246.9, 293.7, 329.6], // Sol6
  [220, 261.6, 329.6, 392], // Lam7
  [174.6, 220, 261.6, 329.6], // Famaj7
] as const;
const TENSE_CHORDS = [
  [220, 261.6, 329.6], // Lam
  [174.6, 220, 261.6], // Fa
  [146.8, 174.6, 220], // Rem
  [164.8, 207.7, 246.9], // Mi (majör: armonik minör gerilimi)
] as const;
export const BARS_PER_CHORD = 2;

/** NS4-40: oda başına ton kayması (yarım ses). Serbest nefes son değeri kullanır. Melodi pes kalsın diye küçük. */
export const ROOM_TRANSPOSE = [0, 2, -2, 3, 1] as const;

/** NS4-40: faz eşikleri. Yukarı eşikler nefes halkasıyla aynı (%35, %70); aşağı eşikler gecikmeli (titreşmesin). */
export const PHASE_UP = { orta: 0.35, tikali: 0.7 } as const;
export const PHASE_DOWN = { orta: 0.28, tikali: 0.6 } as const;

/** Tıkanıklık + önceki faz → yeni faz (eşiklerde gecikmeli; sınırda gidip gelmez). */
export function gamePhase(congestion: number, prev: GamePhase): GamePhase {
  if (congestion >= PHASE_UP.tikali) return 'tikali';
  if (prev === 'tikali' && congestion >= PHASE_DOWN.tikali) return 'tikali';
  if (congestion >= PHASE_UP.orta) return 'orta';
  if (prev !== 'ferah' && congestion >= PHASE_DOWN.orta) return 'orta';
  return 'ferah';
}

/** NS4-40: tempo. Oyun: seviyeyle hafifçe artar (10. seviyeye kadar +1,5/seviye), gergin fazda +6. */
export function tempoFor(kind: MusicKind, level: number, phase: GamePhase): number {
  const t = TRACKS[kind];
  if (kind === 'menu') return t.bpm;
  return t.bpm + Math.min(Math.max(level, 1) - 1, 10) * 1.5 + (phase === 'tikali' ? 6 : 0);
}

/** Bir sekizliğin süresi (sn). */
export function eighth(bpm: number): number {
  return 60 / bpm / 2;
}

/** 24 ölçülük döngüde bölüm (ferah/orta). */
export function sectionAt(barInCycle: number): Section {
  const b = ((barInCycle % 24) + 24) % 24;
  return b < 8 ? 'intro' : b < 16 ? 'chorus' : b < 20 ? 'break' : 'build';
}

/** Planlanan bir nota: 16'lık adım, frekans, süre (16'lık), kazanç. */
export interface NoteEv {
  readonly step: number;
  readonly f: number;
  readonly len: number;
  readonly gain: number;
}
export interface HitEv {
  readonly step: number;
  readonly gain: number;
}
/** Bir ölçünün planı. */
export interface BarPlan {
  readonly bpm: number;
  readonly section: Section;
  /** Bu ölçüde başlayan akor (pad); null: önceki sürer. */
  readonly pad: { readonly chord: readonly number[]; readonly bars: number } | null;
  readonly bass: readonly NoteEv[];
  readonly melody: readonly NoteEv[];
  readonly arp: readonly NoteEv[];
  readonly kick: readonly HitEv[];
  readonly snap: readonly HitEv[];
  readonly hat: readonly HitEv[];
  /** Faz geçişi süsü: gerilime iniş ("drop") ya da rahatlama (yükselen arpej). */
  readonly fill: 'tense' | 'relief' | null;
}

const semi = (f: number, n: number) => f * Math.pow(2, n / 12);

/** Bas desenleri: [16'lık adım, kökten yarım ses, süre (16'lık)]. */
const BASS: Readonly<Record<'bounce' | 'drive' | 'long' | 'menu', readonly (readonly [number, number, number])[]>> = {
  // zıplayan: kök · kök · oktav · kök · beşli · oktav (senkoplu, neşeli)
  bounce: [
    [0, 0, 2],
    [3, 0, 1],
    [6, 12, 2],
    [8, 0, 2],
    [11, 7, 1],
    [14, 12, 2],
  ],
  // gergin: sürüklenen 8'likler, son vuruşta oktav
  drive: [
    [0, 0, 1],
    [2, 0, 1],
    [4, 0, 1],
    [6, 0, 1],
    [8, 0, 1],
    [10, 0, 1],
    [12, 0, 1],
    [14, 12, 1],
  ],
  long: [[0, 0, 12]],
  menu: [[0, 0, 14]],
};

/** Ölçü planı girdisi. */
export interface PlanInput {
  readonly kind: MusicKind;
  /** Oturum başından beri ölçü sırası. */
  readonly bar: number;
  /** Döngü içindeki ölçü (ferah/orta bölümleri için). */
  readonly cycleBar: number;
  readonly phase: GamePhase;
  /** Önceki ölçünün fazı (geçiş süsü için). */
  readonly prevPhase: GamePhase;
  readonly level: number;
  readonly room: number;
}

/**
 * Bir ölçünün planı (saf; rastgelelik yalnızca `melody` üretecinde). Menü: pad + bas + melodi (davul yok).
 * Oyun: faz ve bölüme göre katmanlar; ton odaya göre kayar.
 */
export function planBar(inp: PlanInput, melody: Melody): BarPlan {
  const { kind, bar, phase } = inp;
  const bpm = tempoFor(kind, inp.level, phase);
  const tr = kind === 'game' ? (ROOM_TRANSPOSE[Math.min(Math.max(inp.room, 0), ROOM_TRANSPOSE.length - 1)] ?? 0) : 0;
  const tense = kind === 'game' && phase === 'tikali';
  const chords = kind === 'menu' ? MENU_CHORDS : tense ? TENSE_CHORDS : BRIGHT_CHORDS;
  const chord = (chords[Math.floor(bar / BARS_PER_CHORD) % chords.length] ?? chords[0]).map((f) => semi(f, tr));
  const pad = bar % BARS_PER_CHORD === 0 ? { chord, bars: BARS_PER_CHORD } : null;
  const root = (chord[0] ?? 130.8) / 2;
  const bassOf = (p: keyof typeof BASS, gain: number): NoteEv[] =>
    BASS[p].map(([step, n, len]) => ({ step, f: semi(root, n), len, gain }));
  const notesOf = (g: number): NoteEv[] =>
    melody
      .bar(bar)
      .map((n, i) => ({ n, i }))
      .filter((x) => x.n >= 0)
      .map(({ n, i }) => ({ step: i * 2, f: semi(melody.freq(n), tr), len: 4, gain: g }));

  if (kind === 'menu')
    return {
      bpm,
      section: 'calm',
      pad,
      bass: bassOf('menu', 0.11),
      melody: notesOf(0.075),
      arp: [],
      kick: [],
      snap: [],
      hat: [],
      fill: null,
    };

  const fill =
    phase === 'tikali' && inp.prevPhase !== 'tikali'
      ? 'tense'
      : inp.prevPhase === 'tikali' && phase !== 'tikali'
        ? 'relief'
        : null;

  if (tense) {
    // kalp atışı (lub-dub), sürüklenen bas, gergin 16'lık arpej; her 4 ölçüde arpej yönü değişir
    const up = Math.floor(bar / 4) % 2 === 0;
    const tones = [...chord, chord[0] * 2].map((f) => f * 2);
    const order = up ? [0, 1, 2, 3] : [3, 2, 1, 0];
    return {
      bpm,
      section: 'tense',
      pad,
      bass: bassOf('drive', 0.1),
      melody: [],
      arp: Array.from({ length: STEPS }, (_, i) => ({
        step: i,
        f: tones[order[i % 4] ?? 0] ?? tones[0],
        len: 1,
        gain: i % 4 === 0 ? 0.03 : 0.018,
      })),
      kick: [0, 3, 8, 11].map((step, i) => ({ step, gain: i % 2 === 0 ? 0.5 : 0.32 })),
      snap: [{ step: 12, gain: 0.08 }],
      hat: [],
      fill,
    };
  }

  const section = sectionAt(inp.cycleBar);
  const orta = phase === 'orta';
  const lastOfBuild = section === 'build' && ((inp.cycleBar % 24) + 24) % 24 === 23;
  const hat: HitEv[] = [];
  if (section !== 'break') {
    if (orta || section === 'build')
      for (let i = 0; i < STEPS; i++) hat.push({ step: i, gain: i % 4 === 2 ? 0.07 : i % 2 === 0 ? 0.045 : 0.025 });
    else for (const step of [2, 6, 10, 14]) hat.push({ step, gain: 0.06 });
  }
  const kick: HitEv[] =
    section === 'break'
      ? []
      : section === 'build'
        ? [0, 4, 8, 12].map((step) => ({ step, gain: 0.42 }))
        : (orta ? [0, 7, 8] : [0, 8]).map((step) => ({ step, gain: step === 7 ? 0.26 : 0.45 }));
  const snap: HitEv[] =
    section === 'break'
      ? []
      : lastOfBuild
        ? [4, 12, 13, 14, 15].map((step) => ({ step, gain: 0.05 + (step - 12) * 0.012 }))
        : [4, 12].map((step) => ({ step, gain: 0.09 }));
  const arp: NoteEv[] = orta
    ? [0, 2, 4, 6, 8, 10, 12, 14].map((step, i) => ({
        step,
        f: (chord[i % chord.length] ?? chord[0]) * 2,
        len: 1,
        gain: 0.022,
      }))
    : [];
  const sing = section === 'chorus' || section === 'break';
  return {
    bpm,
    section,
    pad,
    bass: section === 'break' ? bassOf('long', 0.09) : bassOf('bounce', 0.1),
    melody: sing ? notesOf(section === 'break' ? 0.05 : 0.065) : [],
    arp,
    kick,
    snap,
    hat,
    fill,
  };
}

/** Bir ritim motifi ve notaları arasındaki perde adımları (basamak; göreli, bir önceki notadan). */
interface Motif {
  readonly rhythm: readonly boolean[];
  readonly steps: readonly number[];
}

const MOVES = [-2, -1, -1, 0, 1, 1, 2] as const;

/**
 * Motif tabanlı melodi. Her 8 ölçülük ifadede iki motif (A, B) üretilir: ritim + göreli perde adımları.
 * İfade: A · A' (son adım değişir) · B · nefes (tek nota), iki kez. Motifler göreli olduğu için her tekrar bir
 * önceki notadan devam eder (ezgi yeniden kurulur ama sıçramaz; adımlar en çok ±2 basamak).
 */
export class Melody {
  private readonly track: Track;
  private readonly rnd: () => number;
  private pos: number;
  private a: Motif = { rhythm: [], steps: [] };
  private b: Motif = { rhythm: [], steps: [] };
  private phrase = -1;

  constructor(track: Track, rnd: () => number = Math.random) {
    this.track = track;
    this.rnd = rnd;
    this.pos = Math.floor(track.scale.length / 2);
  }

  /** Dizi indeksinin frekansı (Hz). */
  freq(i: number): number {
    return this.track.scale[i] ?? this.track.scale[0] ?? 440;
  }

  /** `bar` numaralı ölçünün 8 sekizliği: dizi indeksi ya da -1 (sus). */
  bar(bar: number): number[] {
    const phrase = Math.floor(bar / 8);
    if (phrase !== this.phrase) {
      this.phrase = phrase;
      this.a = this.motif();
      this.b = this.motif();
    }
    const out = new Array<number>(8).fill(-1);
    const k = bar % 4;
    if (k === 3) {
      // nefes: ölçü başında tek nota
      out[0] = this.move(this.randomStep());
      return out;
    }
    const m = k === 2 ? this.b : this.a;
    const count = m.steps.length;
    let j = 0;
    for (let i = 0; i < 8; i++) {
      if (!m.rhythm[i]) continue;
      // A': son adım değişir (soru → cevap)
      const st = k === 1 && j === count - 1 ? this.randomStep() : (m.steps[j] ?? 0);
      out[i] = this.move(st);
      j++;
    }
    return out;
  }

  private motif(): Motif {
    const rhythm: boolean[] = [],
      steps: number[] = [];
    for (let i = 0; i < 8; i++) {
      const on = i === 0 || this.rnd() < this.track.density;
      rhythm.push(on);
      if (on) steps.push(this.randomStep());
    }
    return { rhythm, steps };
  }

  private randomStep(): number {
    return MOVES[Math.floor(this.rnd() * MOVES.length)] ?? 0;
  }

  /** Perdeyi `st` basamak kaydırır; dizinin kenarında geri seker (aynı notada takılmaz). */
  private move(st: number): number {
    let p = this.pos + st;
    const max = this.track.scale.length - 1;
    if (p < 0) p = Math.min(max, -p);
    if (p > max) p = Math.max(0, 2 * max - p);
    this.pos = p;
    return p;
  }
}
