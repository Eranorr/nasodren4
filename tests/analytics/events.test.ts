// NS4-19: analitik olay şeması, doğru anda bir kez gönderim, gizlilik, dataLayer / console davranışı.
// Gerçek Game + lifecycle + wireGameEvents + HUD + UI modülleri sahte DOM üzerinde; dataLayer kayıtları incelenir.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTracker, newSessionId } from '../../src/analytics/analytics';
import { CFG } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import type { AnalyticsEvent } from '../../src/types/analytics';
import { createAppStubs } from '../helpers/appStubs';
import { installFakeDom, type FakeDom } from '../helpers/fakeDom';
import {
  clearBoard,
  createGame,
  dropVerticalI,
  fillRow,
  finishClear,
  placePiece,
  setupWell,
  stackRows,
} from '../helpers/gameHelpers';

const sources = import.meta.glob<string>('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

/** İzinli payload alanları ve türleri (envelope: event, t, sid, seq). Liste dışı alan = hata. */
type Kind = 'number' | 'boolean' | readonly string[];
const STATES = ['menu', 'playing', 'paused', 'over'] as const;
const SCHEMA: Record<AnalyticsEvent, Record<string, Kind>> = {
  game_start: { best: 'number' },
  powerup_use: { kind: ['siklamen', 'hapsirik'], level: 'number', congestion: 'number', uses: 'number' },
  level_up: { level: 'number' },
  badge: { id: ['ozmotik', 'noro', 'akis', 'hapsu', 'derin'] },
  game_over: {
    reason: ['blockout', 'lockout', 'overlap'],
    score: 'number',
    level: 'number',
    lines: 'number',
    dur_s: 'number',
    cyc_used: 'boolean',
    sneeze_uses: 'number',
    rooms_cleared: 'number',
    tetrises: 'number',
  },
  cta_click: { placement: ['game_over', 'pause_menu'], score: 'number', level: 'number', state: STATES },
  game_loaded: { global_scores: 'boolean', tutorial_done: 'boolean' },
  tutorial_started: { step: 'number', resumed: 'boolean', mode: ['keyboard', 'touch'] },
  tutorial_step: { step: 'number', id: ['move', 'rotate', 'soft', 'hard', 'hold', 'clear'] },
  tutorial_completed: { via: ['clear', 'ack'] },
  tutorial_skipped: { step: 'number' },
  first_drain: { lines: 'number', level: 'number', dur_s: 'number' },
  cyclamen_available: { level: 'number', congestion: 'number' },
  sneeze_available: { level: 'number', congestion: 'number' },
  room_start: { room: 'number', gray: 'number' },
  room_clear: { room: 'number', level: 'number', dur_s: 'number', bonus: 'number' },
  replay_clicked: {},
  leaderboard_opened: {},
  leaderboard_tab_changed: { tab: ['local', 'global'] },
  leaderboard_refreshed: { action: ['refresh', 'retry'] },
  score_submit_started: {},
  score_submit_succeeded: {},
  score_submit_failed: {
    code: ['nickname', 'duplicate', 'rejected', 'rate_limited', 'offline', 'timeout', 'server', 'disabled'],
  },
};
const EVENTS = Object.keys(SCHEMA) as AnalyticsEvent[];

type Rec = Record<string, unknown> & { event: string; t: number; sid: string; seq: number };
function validate(r: Rec): string[] {
  const name = r.event.replace(/^fn_/, '') as AnalyticsEvent;
  const s = SCHEMA[name] as Record<string, Kind> | undefined;
  if (!s) return [`bilinmeyen olay ${r.event}`];
  const errs: string[] = [];
  if (typeof r.t !== 'number' || typeof r.sid !== 'string' || typeof r.seq !== 'number') errs.push('envelope');
  for (const [k, v] of Object.entries(r)) {
    if (k === 'event' || k === 't' || k === 'sid' || k === 'seq') continue;
    const kind = s[k];
    if (!kind) errs.push(`${r.event}.${k} şemada yok`);
    else if (Array.isArray(kind)) {
      if (!kind.includes(v)) errs.push(`${r.event}.${k}=${String(v)}`);
    } else if (typeof v !== kind || (kind === 'number' && !Number.isFinite(v))) errs.push(`${r.event}.${k} tür`);
  }
  return errs;
}

let dom: FakeDom;
let data: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers();
  dom = installFakeDom();
  data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  vi.resetModules();
});
const records = () => dom.window.dataLayer as Rec[];
const names = () => records().map((r) => r.event.replace(/^fn_/, ''));
const count = (n: AnalyticsEvent) => names().filter((x) => x === n).length;
const last = (n: AnalyticsEvent) => [...records()].reverse().find((r) => r.event === `fn_${n}`);

async function loadGame(seed = 1, rooms = false) {
  const { createLifecycle } = await import('../../src/app/lifecycle');
  const { wireGameEvents } = await import('../../src/app/events');
  const { updateHud } = await import('../../src/ui/hud');
  const g = createGame(seed);
  const stubs = createAppStubs(g, rooms);
  const lc = createLifecycle(stubs.deps);
  wireGameEvents({ ...stubs.deps, lifecycle: lc });
  const frame = () => updateHud(g, lc.getState() === 'playing');
  return { g, lc, frame };
}

describe('tracker: dataLayer, console, oturum kimliği', () => {
  it('dataLayer varsa olay oraya itilir: event, t, sid, seq + payload', () => {
    const layer: unknown[] = [];
    const log = vi.fn();
    const tr = createTracker({ dev: true, layer: () => layer, now: () => 1234, log, sid: 'abc12345' });
    tr.track('level_up', { level: 3 });
    tr.track('replay_clicked', {});
    expect(layer).toEqual([
      { event: 'fn_level_up', t: 1234, sid: 'abc12345', seq: 1, level: 3 },
      { event: 'fn_replay_clicked', t: 1234, sid: 'abc12345', seq: 2 },
    ]);
    expect(log).not.toHaveBeenCalled();
  });
  it('dataLayer yok: development console.debug; production hiçbir şey (payload console’a yazılmaz)', () => {
    const log = vi.fn();
    createTracker({ dev: true, layer: () => undefined, log }).track('level_up', { level: 2 });
    expect(log).toHaveBeenCalledTimes(1);
    const prodLog = vi.fn();
    const spies = (['log', 'info', 'debug', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    createTracker({ dev: false, layer: () => undefined, log: prodLog }).track('game_over', {
      reason: 'blockout',
      score: 1,
      level: 1,
      lines: 0,
      dur_s: 1,
      cyc_used: false,
      sneeze_uses: 0,
      rooms_cleared: 0,
      tetrises: 0,
    });
    createTracker({ dev: false, layer: () => ({ push: vi.fn() }) }).track('level_up', { level: 2 }); // dizi değilse yok sayılır
    expect(prodLog).not.toHaveBeenCalled();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
  it('oturum kimliği: bellekte, kısa, kriptografik değil; storage veya çerez yazılmaz', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    const cookie = vi.fn();
    Object.defineProperty(dom.document, 'cookie', { set: cookie, configurable: true });
    const ids = new Set(Array.from({ length: 20 }, () => newSessionId()));
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{8}$/);
    expect(ids.size).toBeGreaterThan(15);
    const tr = createTracker({ dev: false, layer: () => [] });
    tr.track('leaderboard_opened', {});
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    // yorumlar hariç (açıklamalar "localStorage yok" gibi ifadeler içerir)
    const src = (sources['../../src/analytics/analytics.ts'] ?? '').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/crypto|localStorage|sessionStorage|document\.cookie|navigator\.(userAgent|platform)/);
  });
  it('analitik kodu üçüncü taraf script veya çerez eklemez', () => {
    for (const [f, s] of Object.entries(sources)) {
      expect(s, f).not.toMatch(/googletagmanager|google-analytics|gtag\(|document\.cookie|createElement\('script'\)/);
    }
  });
});

describe('oyun hunisi: her olay doğru anda bir kez', () => {
  it('başlat → ilk drenaj (bir kez) → seviye → oyun sonu; şema geçerli', async () => {
    const { g, lc } = await loadGame();
    lc.start();
    expect(count('game_start')).toBe(1);
    setupWell(g, 1);
    dropVerticalI(g);
    expect(count('first_drain')).toBe(1);
    expect(last('first_drain')).toMatchObject({ lines: 1, level: 1 });
    finishClear(g);
    setupWell(g, 4);
    dropVerticalI(g);
    finishClear(g);
    expect(count('first_drain')).toBe(1); // ikinci temizleme olay üretmez
    g.gameOver('blockout');
    expect(count('game_over')).toBe(1);
    // yeni oyun: yeni ilk drenaj
    lc.start();
    setupWell(g, 2);
    dropVerticalI(g);
    expect(count('first_drain')).toBe(2);
    expect(count('game_start')).toBe(2);
    for (const r of records()) expect(validate(r), r.event).toEqual([]);
  });
  it('NS4-27 odalar: başta room_start; oda açılınca room_clear, sonra sıradaki odanın room_start; oyun sonunda sayı', async () => {
    const { g, lc } = await loadGame(1, true);
    lc.start();
    expect(last('room_start')).toMatchObject({ room: 0, gray: g.roomGray });
    clearBoard(g);
    fillRow(g, 21, PIECE.GARBAGE, [9]);
    dropVerticalI(g);
    finishClear(g);
    expect(count('room_clear')).toBe(1);
    expect(last('room_clear')).toMatchObject({ room: 0, level: 1, bonus: CFG.roomBonus });
    finishClear(g);
    expect(count('room_start')).toBe(2);
    expect(last('room_start')).toMatchObject({ room: 1 });
    g.gameOver('lockout');
    expect(last('game_over')).toMatchObject({ rooms_cleared: 1 });
    for (const r of records()) expect(validate(r), r.event).toEqual([]);
  });
  it('güçlendiriciler: kullanılabilir olunca oyun başına bir kez; her hapşırık kullanımı', async () => {
    const { g, lc, frame } = await loadGame();
    lc.start();
    stackRows(g, 7); // %35
    frame();
    frame();
    expect([count('cyclamen_available'), count('sneeze_available')]).toEqual([1, 1]);
    for (let i = 0; i < 3; i++) {
      stackRows(g, 7);
      g.sneezePieces = CFG.sneezePieces; // şarj dolu
      g.useSneeze();
      finishClear(g);
      frame();
    }
    expect(count('powerup_use')).toBe(3);
    expect(last('powerup_use')).toMatchObject({ kind: 'hapsirik', uses: 3 });
    stackRows(g, 8);
    g.useCyc();
    finishClear(g);
    frame();
    expect([count('cyclamen_available'), count('sneeze_available')]).toEqual([1, 1]);
    // yeni oyunda yeniden bir kez
    lc.start();
    stackRows(g, 7);
    frame();
    expect([count('cyclamen_available'), count('sneeze_available')]).toEqual([2, 2]);
    for (const r of records()) expect(validate(r), r.event).toEqual([]);
  });
  it('arayüz: Tekrar oyna, Skorlar, CTA (yerleşim + oyun durumu); gezinme engellenmez', async () => {
    const { g, lc } = await loadGame();
    const { bindUiAnalytics } = await import('../../src/analytics/funnel');
    bindUiAnalytics({ getState: lc.getState, getScore: () => g.score, getLevel: () => g.level });
    dom.el('b-again').addEventListener('click', lc.start); // bootstrap sırası: analitik dinleyici önce
    lc.start();
    g.score = 4321;
    lc.pause();
    const p = dom.el('cta-pause').dispatch('click');
    expect(p.defaultPrevented).toBe(false);
    expect(last('cta_click')).toMatchObject({ placement: 'pause_menu', level: 1, state: 'paused' });
    lc.resume();
    g.gameOver('blockout');
    vi.advanceTimersByTime(1000);
    const o = dom.el('cta-over').dispatch('click');
    expect(o.defaultPrevented).toBe(false);
    expect(last('cta_click')).toMatchObject({ placement: 'game_over', score: 4321, state: 'over' });
    dom.el('b-again').click();
    const n = names();
    expect(n.slice(-2)).toEqual(['replay_clicked', 'game_start']);
    dom.el('b-scores').click();
    expect(count('leaderboard_opened')).toBe(1);
    for (const r of records()) expect(validate(r), r.event).toEqual([]);
  });
});

describe('öğretici olayları', () => {
  async function tut(done = false) {
    const { Tutorial } = await import('../../src/tutorial/Tutorial');
    const g = createGame(1);
    const track = vi.fn();
    let isDone = done;
    const store = { isDone: () => isDone, markDone: () => void (isDone = true) };
    const t = new Tutorial(g, { show: () => {}, hide: () => {} }, store, { mode: 'keyboard', track });
    return { g, t, track };
  }
  it('başladı → her adım bir kez → tamamlandı (son adım satır temizlemeyle)', async () => {
    const { g, t, track } = await tut();
    t.onGameStart();
    clearBoard(g);
    placePiece(g, PIECE.T, 0, 4, 2);
    g.move(1);
    g.move(1); // yanlış/tekrar eylem adım üretmez
    g.rotate(1);
    t.softDrop();
    g.hardDrop();
    g.doHold();
    // drenaj: alt satırı neredeyse doldur, dikey I ile bitir
    setupWell(g, 1);
    dropVerticalI(g);
    expect(track.mock.calls).toEqual([
      ['tutorial_started', { step: 1, resumed: false, mode: 'keyboard' }],
      ['tutorial_step', { step: 1, id: 'move' }],
      ['tutorial_step', { step: 2, id: 'rotate' }],
      ['tutorial_step', { step: 3, id: 'soft' }],
      ['tutorial_step', { step: 4, id: 'hard' }],
      ['tutorial_step', { step: 5, id: 'hold' }],
      ['tutorial_step', { step: 6, id: 'clear' }],
      ['tutorial_completed', { via: 'clear' }],
    ]);
    t.onGameStart(); // tamamlandı: yeniden başlamaz
    expect(track).toHaveBeenCalledTimes(8);
  });
  it('yarım öğretici yeni oyunda kaldığı adımdan sürer (resumed); Atla bir kez; Tamam ile bitiş', async () => {
    const { g, t, track } = await tut();
    t.onGameStart();
    g.move(1);
    t.onSessionEnd();
    t.onGameStart();
    expect(track.mock.calls.at(-1)).toEqual(['tutorial_started', { step: 2, resumed: true, mode: 'keyboard' }]);
    t.skip();
    t.skip(); // kapalıyken tekrar Atla olay üretmez
    expect(track.mock.calls.filter(([n]) => n === 'tutorial_skipped')).toEqual([['tutorial_skipped', { step: 2 }]]);
    const b = await tut();
    b.t.onGameStart();
    for (const step of ['move', 'rotate', 'soft', 'hard', 'hold'] as const) {
      if (step === 'move') b.g.move(1);
      if (step === 'rotate') b.g.rotate(1);
      if (step === 'soft') b.t.softDrop();
      if (step === 'hard') b.g.hardDrop();
      if (step === 'hold') b.g.doHold();
    }
    b.t.acknowledge();
    expect(b.track.mock.calls.slice(-2)).toEqual([
      ['tutorial_step', { step: 6, id: 'clear' }],
      ['tutorial_completed', { via: 'ack' }],
    ]);
  });
});

describe('skor tablosu ve global gönderim olayları; kişisel veri yok', () => {
  const NICK = 'GizliTakmaAd';
  it('sekme değişimi yalnızca kullanıcı değiştirince; yenile/tekrar dene; gönderim deneme + sonuç kodları', async () => {
    const { createScoresView } = await import('../../src/ui/scoresView');
    const { createSubmitPanel } = await import('../../src/ui/submitScore');
    const fetchTop = vi.fn(() => Promise.resolve({ ok: false as const, reason: 'error' as const }));
    const results = [{ ok: false, reason: 'offline' }, { ok: false, reason: 'rate_limited' }, { ok: true }] as const;
    let i = 0;
    const submit = vi.fn(() => Promise.resolve(results[i++] ?? { ok: true as const }));
    const client = { enabled: true, fetchTop, submit };
    const v = createScoresView({ client, loadLocal: () => [] });
    v.open(); // varsayılan Yerel: olay yok
    expect(count('leaderboard_tab_changed')).toBe(0);
    dom.el('tab-global').click();
    dom.el('tab-global').click(); // aynı sekme: olay yok
    await vi.advanceTimersByTimeAsync(0);
    dom.el('b-global-retry').click();
    dom.el('b-global-refresh').click();
    dom.el('tab-global').dispatch('keydown', { key: 'Home' });
    expect(
      records()
        .filter((r) => r.event === 'fn_leaderboard_tab_changed')
        .map((r) => r['tab']),
    ).toEqual(['global', 'local']);
    expect(
      records()
        .filter((r) => r.event === 'fn_leaderboard_refreshed')
        .map((r) => r['action']),
    ).toEqual(['retry', 'refresh']);

    const p = createSubmitPanel({ client, loadNickname: () => '', saveNickname: () => {}, updateLocal: () => {} });
    p.prepare({
      id: '00000000-0000-4000-8000-000000000001',
      nickname: '',
      score: 777,
      lines: 12,
      level: 2,
      durationSeconds: 90,
      recordedAt: 1,
      submitted: false,
    });
    const input = dom.el('nick-input') as unknown as { value: string };
    input.value = '<x>';
    dom.el('submit-score').dispatch('submit');
    await vi.advanceTimersByTimeAsync(0);
    input.value = NICK;
    for (let k = 0; k < 3; k++) {
      dom.el('submit-score').dispatch('submit');
      await vi.advanceTimersByTimeAsync(0);
    }
    dom.el('submit-score').dispatch('submit'); // gönderildi: deneme yok
    await vi.advanceTimersByTimeAsync(0);
    const sub = records()
      .filter((r) => r.event.startsWith('fn_score_submit'))
      .map((r) => [r.event.replace('fn_score_submit_', ''), r['code']]);
    expect(sub).toEqual([
      ['started', undefined],
      ['failed', 'nickname'],
      ['started', undefined],
      ['failed', 'offline'],
      ['started', undefined],
      ['failed', 'rate_limited'],
      ['started', undefined],
      ['succeeded', undefined],
    ]);
    const all = JSON.stringify(records());
    expect(all).not.toContain(NICK);
    // gönderim gövdesi alanları (anahtar olarak) ve değerleri analitikte yok; 'nickname' yalnızca hata kodu değeri
    expect(all).not.toMatch(
      /"score":777|00000000-0000-4000|"nickname":|"gameId"|"durationSeconds"|apikey|sb_publishable/,
    );
    for (const r of records()) expect(validate(r), r.event).toEqual([]);
  });
});

describe('statik sözleşme', () => {
  it('her olay kaynakta en az bir yerde gönderilir; game_loaded bootstrap’ta bir kez', () => {
    const all = Object.values(sources).join('\n');
    for (const e of EVENTS) expect(all, e).toMatch(new RegExp(`(track|\\?\\.)\\(?'${e}'`));
    const boot = sources['../../src/app/bootstrap.ts'] ?? '';
    expect(boot.match(/track\('game_loaded'/g)).toHaveLength(1);
  });
  it('analitik payload’larında serbest metin yok: tür dosyasında string alanlar yalnızca sabit birlikler', () => {
    const t = sources['../../src/types/analytics.ts'] ?? '';
    expect(t).not.toMatch(/:\s*string\b(?!\s*;\s*\n\s*seq)/); // yalnızca envelope sid
    expect(t).toMatch(/sid: string;/);
  });
  it('CTA değerleri değişmedi', () => {
    expect(CFG.cta).toBe('https://www.yasasinsaglik.com/');
  });
});
