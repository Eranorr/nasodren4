// NS4-39: menü ve oyun müziği: parça verisi, motif tabanlı melodi, mod geçişleri, ses düzeyi ayarları.
// NS4-40: enerjik oyun müziği: fazlar (ferah / orta / tikali), 24 ölçülük döngü, tempo, oda tonu, geçiş süsleri.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Melody,
  PHASE_DOWN,
  PHASE_UP,
  ROOM_TRANSPOSE,
  STEPS,
  TRACKS,
  eighth,
  gamePhase,
  planBar,
  sectionAt,
  tempoFor,
  type BarPlan,
  type GamePhase,
  type PlanInput,
  type Track,
} from '../../src/audio/music';
import { DEFAULT_MUSIC_VOL, DEFAULT_SFX_VOL, MUSIC_TICK_MS, Sound, volumeGain } from '../../src/audio/SoundManager';
import { installFakeAudio, type FakeAudioContext } from '../helpers/fakeAudio';

/** Tohumlu rastgele (testler tekrarlanabilir). */
function rng(seed: number) {
  let x = seed;
  return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', {});
});
afterEach(() => {
  vi.useRealTimers();
});

describe('parçalar', () => {
  it.each(Object.entries(TRACKS))('%s: pentatonik dizi, seyrek melodi', (_, t: Track) => {
    expect(t.scale).toHaveLength(9);
    for (let i = 1; i < t.scale.length; i++) expect(t.scale[i]).toBeGreaterThan(t.scale[i - 1]);
    // pentatonik: bir oktavda 5 perde sınıfı
    const pcs = new Set(t.scale.map((f) => (Math.round(12 * Math.log2(f / 440)) % 12) + 12).map((n) => n % 12));
    expect(pcs.size).toBe(5);
    expect(t.density).toBeLessThan(0.5);
  });
  it('menü sakin, oyun enerjik ama koşturmaz; oyun melodisi pes; rüzgâr yalnızca oyunda', () => {
    expect(TRACKS.menu.bpm).toBeLessThanOrEqual(80);
    expect(TRACKS.game.bpm).toBeGreaterThanOrEqual(100);
    expect(tempoFor('game', 99, 'tikali')).toBeLessThanOrEqual(132);
    expect(Math.max(...TRACKS.game.scale)).toBeLessThan(800);
    expect([TRACKS.game.wind, TRACKS.menu.wind]).toEqual([true, false]);
    expect(eighth(72)).toBeCloseTo(60 / 72 / 2);
  });
});

describe('NS4-40: fazlar ve tempo', () => {
  it('faz eşikleri gecikmeli: yukarı %35 / %70, aşağı %28 / %60 (sınırda gidip gelmez)', () => {
    expect(PHASE_DOWN.orta).toBeLessThan(PHASE_UP.orta);
    expect(PHASE_DOWN.tikali).toBeLessThan(PHASE_UP.tikali);
    const walk = (cs: number[]) => {
      let p: GamePhase = 'ferah';
      return cs.map((c) => (p = gamePhase(c, p)));
    };
    expect(walk([0, 0.34, 0.35, 0.3, 0.27])).toEqual(['ferah', 'ferah', 'orta', 'orta', 'ferah']);
    expect(walk([0.69, 0.7, 0.65, 0.6, 0.59, 0.2])).toEqual(['orta', 'tikali', 'tikali', 'tikali', 'orta', 'ferah']);
    expect(walk([0.9])).toEqual(['tikali']);
  });
  it('tempo seviyeyle hafifçe artar (10. seviyede durur), gergin fazda hızlanır; menü sabit', () => {
    expect(tempoFor('game', 1, 'ferah')).toBe(TRACKS.game.bpm);
    expect(tempoFor('game', 5, 'ferah')).toBeGreaterThan(tempoFor('game', 4, 'ferah'));
    expect(tempoFor('game', 11, 'ferah')).toBe(tempoFor('game', 20, 'ferah'));
    expect(tempoFor('game', 3, 'tikali')).toBeGreaterThan(tempoFor('game', 3, 'orta'));
    expect(tempoFor('menu', 15, 'tikali')).toBe(TRACKS.menu.bpm);
  });
  it('24 ölçülük döngü: giriş 8 · nakarat 8 · ara 4 · yükseliş 4', () => {
    const seq = Array.from({ length: 24 }, (_, b) => sectionAt(b));
    expect(seq.filter((x) => x === 'intro')).toHaveLength(8);
    expect(seq.filter((x) => x === 'chorus')).toHaveLength(8);
    expect(seq.filter((x) => x === 'break')).toHaveLength(4);
    expect(seq.filter((x) => x === 'build')).toHaveLength(4);
    expect(sectionAt(24)).toBe('intro');
    expect(sectionAt(-1)).toBe('build');
  });
});

describe('NS4-40: ölçü planı', () => {
  const base: PlanInput = { kind: 'game', bar: 0, cycleBar: 0, phase: 'ferah', prevPhase: 'ferah', level: 1, room: 0 };
  const plan = (o: Partial<PlanInput>) => planBar({ ...base, ...o }, new Melody(TRACKS[o.kind ?? 'game'], rng(5)));
  const steps = (p: BarPlan) => [...p.bass, ...p.melody, ...p.arp, ...p.kick, ...p.snap, ...p.hat].map((e) => e.step);

  it('bütün olaylar ölçü içinde (0..15)', () => {
    for (const phase of ['ferah', 'orta', 'tikali'] as const)
      for (let b = 0; b < 24; b++)
        for (const st of steps(plan({ phase, bar: b, cycleBar: b }))) {
          expect(st).toBeGreaterThanOrEqual(0);
          expect(st).toBeLessThan(STEPS);
        }
  });
  it('menü: davul ve arpej yok; pad, bas, melodi', () => {
    const p = plan({ kind: 'menu' });
    expect([p.kick, p.snap, p.hat, p.arp]).toEqual([[], [], [], []]);
    expect(p.pad).not.toBeNull();
    expect(p.bass.length).toBeGreaterThan(0);
  });
  it('ferah: girişte davul + bas (melodi yok), nakaratta melodi, arada davul yok, yükselişte 16 shaker', () => {
    const intro = plan({ cycleBar: 0 }),
      chorus = plan({ cycleBar: 8, bar: 8 }),
      brk = plan({ cycleBar: 16, bar: 16 }),
      build = plan({ cycleBar: 20, bar: 20 });
    expect([intro.section, chorus.section, brk.section, build.section]).toEqual(['intro', 'chorus', 'break', 'build']);
    expect(intro.kick.length).toBeGreaterThan(0);
    expect(intro.melody).toHaveLength(0);
    expect(chorus.melody.length).toBeGreaterThan(0);
    expect([brk.kick, brk.snap, brk.hat]).toEqual([[], [], []]);
    expect(build.hat).toHaveLength(STEPS);
    expect(intro.arp).toHaveLength(0);
  });
  it('orta: arpej ve 16 shaker eklenir (enerji yükselir)', () => {
    const p = plan({ phase: 'orta', prevPhase: 'orta' });
    expect(p.arp.length).toBeGreaterThan(0);
    expect(p.hat).toHaveLength(STEPS);
  });
  it('tikali: biçim değişir: minör akorlar, kalp atışı kick, sürüklenen bas, 16 arpej, melodi yok', () => {
    const calm = plan({}),
      p = plan({ phase: 'tikali', prevPhase: 'tikali' });
    expect(p.section).toBe('tense');
    expect(p.melody).toHaveLength(0);
    expect(p.arp).toHaveLength(STEPS);
    expect(p.kick.map((k) => k.step)).toEqual([0, 3, 8, 11]);
    expect(p.bass).toHaveLength(8);
    expect(p.hat).toHaveLength(0);
    expect(p.pad?.chord).not.toEqual(calm.pad?.chord);
    expect(p.bpm).toBeGreaterThan(calm.bpm);
  });
  it('geçiş süsü: gerilime girerken "tense", çıkarken "relief"; faz sürerken yok', () => {
    expect(plan({ phase: 'tikali', prevPhase: 'orta' }).fill).toBe('tense');
    expect(plan({ phase: 'tikali', prevPhase: 'tikali' }).fill).toBeNull();
    expect(plan({ phase: 'orta', prevPhase: 'tikali' }).fill).toBe('relief');
    expect(plan({ phase: 'ferah', prevPhase: 'orta' }).fill).toBeNull();
  });
  it('her odada ton değişir (oda tablosundaki yarım ses kadar)', () => {
    const r0 = plan({ room: 0 }).pad?.chord[0] ?? 0;
    ROOM_TRANSPOSE.forEach((n, room) => {
      expect(plan({ room }).pad?.chord[0]).toBeCloseTo(r0 * Math.pow(2, n / 12), 6);
    });
    expect(Math.max(...ROOM_TRANSPOSE.map(Math.abs))).toBeLessThanOrEqual(3); // melodi pes kalır
    expect(new Set(ROOM_TRANSPOSE).size).toBe(ROOM_TRANSPOSE.length);
  });
});

describe('melodi', () => {
  it('ölçü 8 sekizlik; ilk sekizlik nota; indeksler dizi içinde; her 4. ölçü tek nota (nefes)', () => {
    const m = new Melody(TRACKS.menu, rng(7));
    for (let bar = 0; bar < 32; bar++) {
      const notes = m.bar(bar);
      expect(notes).toHaveLength(8);
      expect(notes[0]).toBeGreaterThanOrEqual(0);
      for (const n of notes) expect(n).toBeGreaterThanOrEqual(-1);
      for (const n of notes) expect(n).toBeLessThan(TRACKS.menu.scale.length);
      if (bar % 4 === 3) expect(notes.filter((n) => n >= 0)).toHaveLength(1);
    }
  });
  it("A ve A' aynı ritim; her 8 ölçüde yeni motif (ezber döngü yok)", () => {
    const m = new Melody(TRACKS.menu, rng(3));
    const bars = Array.from({ length: 24 }, (_, b) => m.bar(b).map((n) => n >= 0));
    expect(bars[1]).toEqual(bars[0]);
    const phrases = [0, 8, 16].map((b) => JSON.stringify([bars[b], bars[b + 2]]));
    expect(new Set(phrases).size).toBeGreaterThan(1);
  });
  it.each([1, 11, 42, 99])('perde sıçramaz: art arda notalar en çok 2 basamak (tohum %i)', (seed) => {
    const m = new Melody(TRACKS.game, rng(seed));
    let prev = -1;
    for (let b = 0; b < 64; b++)
      for (const n of m.bar(b)) {
        if (n < 0) continue;
        if (prev >= 0) expect(Math.abs(n - prev)).toBeLessThanOrEqual(2);
        prev = n;
      }
  });
});

describe('Sound: menü / oyun müziği', () => {
  const run = (c: FakeAudioContext, sec: number) => {
    for (let t = 0; t < sec; t += MUSIC_TICK_MS / 1000) {
      c.advance(MUSIC_TICK_MS / 1000);
      vi.advanceTimersByTime(MUSIC_TICK_MS);
    }
  };
  it('menü müziği süzgeçten geçmez, oyun müziği geçer; geçişte tek zamanlayıcı', () => {
    const { ctx } = installFakeAudio();
    const s = new Sound({ sound: true, music: true });
    s.unlock();
    const c = ctx();
    const muffle = c.nodes.find((n) => n.kind === 'biquad')!;
    const vol = c.nodes.find((n) => n.kind === 'gain' && muffle.outputs.has(n))!;
    s.setMusic('menu');
    expect(s.musicKind).toBe('menu');
    const menuBus = c.nodes.filter((n) => n.kind === 'gain' && n.outputs.has(vol) && n !== muffle);
    expect(menuBus).toHaveLength(1); // menü veri yolu doğrudan müzik düzeyine
    s.setMusic('game');
    expect(s.musicKind).toBe('game');
    run(c, 3);
    s.setMusic('game'); // aynı parça yeniden başlamaz
    expect(s.musicKind).toBe('game');
    s.setMusic('off');
    expect(s.musicOn).toBe(false);
  });
  it('NS4-40: faz tıkanıklıktan izlenir; müzik faz değişimlerinde kesilmeden sürer, davul gürültüsü çalar', () => {
    const { ctx } = installFakeAudio();
    const s = new Sound({ sound: true, music: true });
    s.unlock();
    const c = ctx();
    s.setMusicContext(3, 1);
    s.setMusic('game');
    run(c, 3);
    const n1 = c.sources().length;
    expect(c.sources('buffer').length).toBeGreaterThan(1); // rüzgâr + shaker / parmak şıklatma
    s.setCongestion(0.8);
    expect(s.musicPhase).toBe('tikali');
    run(c, 3);
    expect(c.sources().length).toBeGreaterThan(n1);
    s.setCongestion(0.65);
    expect(s.musicPhase).toBe('tikali');
    s.setCongestion(0.5);
    expect(s.musicPhase).toBe('orta');
    run(c, 3);
    expect([s.musicKind, s.musicOn]).toEqual(['game', true]);
  });
  it('menü müziği ayarı kapalıysa menüde sessiz, oyunda çalar; müzik düzeyi 0 ise hiç çalmaz', () => {
    installFakeAudio();
    const st = { sound: true, music: true, menuMusic: false, musicVol: 70, sfxVol: 80 };
    const s = new Sound(st);
    s.unlock();
    s.setMusic('menu');
    expect(s.musicOn).toBe(false);
    s.setMusic('game');
    expect(s.musicKind).toBe('game');
    st.musicVol = 0;
    s.applySettings();
    expect(s.musicOn).toBe(false);
    st.musicVol = 40;
    st.menuMusic = true;
    s.setMusic('menu');
    expect(s.musicKind).toBe('menu');
  });
  it('ses düzeyi: varsayılanda kazanç 1, kare eğri, sınırlar', () => {
    expect(volumeGain(DEFAULT_MUSIC_VOL, DEFAULT_MUSIC_VOL)).toBe(1);
    expect(volumeGain(DEFAULT_SFX_VOL, DEFAULT_SFX_VOL)).toBe(1);
    expect(volumeGain(0, 70)).toBe(0);
    expect(volumeGain(35, 70)).toBeCloseTo(0.25);
    expect(volumeGain(500, 70)).toBe(volumeGain(100, 70));
    const { ctx } = installFakeAudio();
    const st = { sound: true, music: true, sfxVol: 40 };
    const s = new Sound(st);
    s.unlock();
    const sfx = ctx().nodes[2] as unknown as { gain: { value: number } };
    expect(sfx.gain.value).toBeCloseTo(0.25);
  });
  it('gecikmeli giriş: oyun sonundan sonra menü müziği notaları gecikmeyle başlar', () => {
    const { ctx } = installFakeAudio();
    const s = new Sound({ sound: true, music: true });
    s.unlock();
    const c = ctx();
    s.setMusic('menu', 1.6);
    run(c, 0.5);
    expect(c.sources().filter((n) => n.started !== null && n.started < 1.6)).toHaveLength(0);
    run(c, 2);
    expect(c.sources().filter((n) => n.started !== null).length).toBeGreaterThan(0);
  });
  it('efekt düzeyi örnek sesi sık tekrarda seyreltilir; efektler kapalıyken çalmaz', () => {
    const { ctx } = installFakeAudio();
    const st = { sound: true, music: false };
    const s = new Sound(st);
    s.unlock();
    const c = ctx();
    const n0 = c.sources().length;
    for (let i = 0; i < 5; i++) s.preview();
    expect(c.sources().length - n0).toBe(2); // tek çan (iki kısmi)
    st.sound = false;
    s.applySettings();
    c.advance(1);
    s.preview();
    expect(c.sources().length - n0).toBe(2);
  });
});
