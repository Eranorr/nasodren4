// NS4-18: Skorlar ekranı (sekmeler, tablolar, global durumlar), oyun sonu gönderim paneli ve oyun sonu akışı.
// Sahte DOM; ağ katmanı taklit edilir (gerçek Supabase'e bağlanılmaz).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchResult, LeaderboardClient, SubmitResult } from '../../src/leaderboard/globalClient';
import type { LocalScore } from '../../src/leaderboard/localScores';
import { createAppStubs } from '../helpers/appStubs';
import { installFakeDom, type FakeDom, type FakeElement } from '../helpers/fakeDom';
import { createGame } from '../helpers/gameHelpers';

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

const entry = (n: number, score: number, nickname = ''): LocalScore => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  nickname,
  score,
  lines: 12,
  level: 2,
  durationSeconds: 90,
  recordedAt: 1000 + n,
  submitted: false,
});
/** Elle çözülen sahte istemci. */
function fakeClient(enabled = true) {
  const fetches: ((r: FetchResult) => void)[] = [];
  const submits: ((r: SubmitResult) => void)[] = [];
  const fetchTop = vi.fn(() => new Promise<FetchResult>((r) => fetches.push(r)));
  const submit = vi.fn(() => new Promise<SubmitResult>((r) => submits.push(r)));
  const c: LeaderboardClient = { enabled, fetchTop, submit };
  return { c, fetches, submits, fetchTop, submit };
}
const rows = (id: string) =>
  (dom.el(id).children[0]?.children ?? []).map((tr) => tr.children.map((td: FakeElement) => td.textContent));
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('Skorlar ekranı', () => {
  async function view(local: LocalScore[], client = fakeClient().c) {
    const { createScoresView } = await import('../../src/ui/scoresView');
    return createScoresView({ client, loadLocal: () => local });
  }
  it('Yerel: sıra, takma ad (yoksa —), skor, drenaj; en çok 10 satır; boş liste durumu', async () => {
    const v = await view([entry(1, 12345, 'Ferah'), entry(2, 900)]);
    v.open();
    expect(rows('table-local')).toEqual([
      ['1', 'Ferah', '12.345', '12'],
      ['2', '—', '900', '12'],
    ]);
    expect(dom.el('local-empty').hidden).toBe(true);
    const empty = await view([]);
    empty.open();
    expect(dom.el('table-local').hidden).toBe(true);
    expect(dom.el('local-empty').hidden).toBe(false);
  });
  it('sekmeler: aria-selected, tabindex (roving), panel görünürlüğü; ok tuşları ve Home/End', async () => {
    const v = await view([]);
    v.open();
    const tl = dom.el('tab-local'),
      tg = dom.el('tab-global');
    expect([tl.getAttribute('aria-selected'), tg.getAttribute('aria-selected'), tl.tabIndex, tg.tabIndex]).toEqual([
      'true',
      'false',
      0,
      -1,
    ]);
    const ev = tl.dispatch('keydown', { key: 'ArrowRight' });
    expect(ev.defaultPrevented).toBe(true);
    expect(v.selected()).toBe('global');
    expect([dom.el('panel-local').hidden, dom.el('panel-global').hidden]).toEqual([true, false]);
    expect(dom.document.activeElement?.id).toBe('tab-global');
    tg.dispatch('keydown', { key: 'Home' });
    expect(v.selected()).toBe('local');
    tl.dispatch('keydown', { key: 'End' });
    expect(v.selected()).toBe('global');
    tg.dispatch('keydown', { key: 'ArrowLeft' });
    expect(v.selected()).toBe('local');
    tg.click();
    expect(v.selected()).toBe('global');
  });
  it('Global: yükleniyor → liste + Yenile; yalnızca ilk seçilişte ve kullanıcı yenileyince yüklenir (polling yok)', async () => {
    const f = fakeClient();
    const v = await view([], f.c);
    v.open();
    expect(f.fetchTop).not.toHaveBeenCalled(); // Yerel açılır, ağ isteği yok
    v.select('global');
    expect(dom.el('global-status').textContent).toBe('Yükleniyor…');
    expect(dom.el('panel-global').getAttribute('aria-busy')).toBe('true');
    f.fetches[0]?.({ ok: true, entries: [{ rank: 1, nickname: 'Nefes', score: 5000, lines: 30, level: 4 }] });
    await flush();
    expect(rows('table-global')).toEqual([['1', 'Nefes', '5.000', '30']]);
    expect([dom.el('table-global').hidden, dom.el('global-status').hidden, dom.el('b-global-refresh').hidden]).toEqual([
      false,
      true,
      false,
    ]);
    v.select('local');
    v.select('global');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(f.fetchTop).toHaveBeenCalledTimes(1);
    dom.el('b-global-refresh').click();
    expect(f.fetchTop).toHaveBeenCalledTimes(2);
  });
  it.each<[FetchResult, string, boolean, boolean]>([
    [{ ok: true, entries: [] }, 'Henüz skor yok', true, false],
    [{ ok: false, reason: 'disabled' }, 'Global tablo çevrimdışı', true, true],
    [{ ok: false, reason: 'offline' }, 'Global tablo çevrimdışı', false, true],
    [{ ok: false, reason: 'timeout' }, 'Global tablo yüklenemedi', false, true],
    [{ ok: false, reason: 'error' }, 'Global tablo yüklenemedi', false, true],
  ])('Global durum %j → %s', async (result, text, retryHidden, refreshHidden) => {
    const f = fakeClient();
    const v = await view([], f.c);
    v.open();
    v.select('global');
    f.fetches[0]?.(result);
    await flush();
    expect(dom.el('global-status').textContent).toBe(text);
    expect(dom.el('table-global').hidden).toBe(true);
    expect(dom.el('b-global-retry').hidden).toBe(retryHidden);
    expect(dom.el('b-global-refresh').hidden).toBe(refreshHidden);
    expect(dom.el('panel-global').getAttribute('aria-busy')).toBe('false');
  });
  it('Tekrar dene yeniden yükler; eski (geç gelen) yanıt yenisini ezmez', async () => {
    const f = fakeClient();
    const v = await view([], f.c);
    v.open();
    v.select('global');
    f.fetches[0]?.({ ok: false, reason: 'error' });
    await flush();
    dom.el('b-global-retry').click();
    dom.el('b-global-refresh').click(); // gizli olsa da: iki istek uçuşta
    f.fetches[2]?.({ ok: true, entries: [{ rank: 1, nickname: 'Yeni', score: 2, lines: 0, level: 1 }] });
    await flush();
    f.fetches[1]?.({ ok: true, entries: [{ rank: 1, nickname: 'Eski', score: 1, lines: 0, level: 1 }] });
    await flush();
    expect(rows('table-global')).toEqual([['1', 'Yeni', '2', '0']]);
  });
  it('Skorlar alt ekran: ilk odak Yerel sekmesi; Escape/geri açan butona döner', async () => {
    const screens = await import('../../src/ui/screens');
    screens.bindBackButtons();
    dom.el('b-scores').focus();
    screens.openSub('scr-scores');
    await vi.advanceTimersByTimeAsync(50);
    expect(dom.visibleScreen()).toBe('scr-scores');
    expect(dom.document.activeElement?.id).toBe('tab-local');
    expect(screens.closeSub()).toBe(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(dom.visibleScreen()).toBe('scr-start');
    expect(dom.document.activeElement?.id).toBe('b-scores');
  });
});

describe('oyun sonu global gönderim paneli', () => {
  async function panel(client: LeaderboardClient, nick = '') {
    const { createSubmitPanel } = await import('../../src/ui/submitScore');
    const saveNickname = vi.fn();
    const updateLocal = vi.fn();
    const p = createSubmitPanel({ client, loadNickname: () => nick, saveNickname, updateLocal });
    const submit = () => {
      dom.el('submit-score').dispatch('submit');
      return flush();
    };
    return { p, saveNickname, updateLocal, submit };
  }
  const input = () => dom.el('nick-input') as FakeElement & { value: string };
  it('env yoksa çevrimdışı: buton ve giriş kapalı, ağa gidilmez', async () => {
    const f = fakeClient(false);
    const { p, submit } = await panel(f.c);
    p.prepare(entry(1, 500));
    expect([p.state(), dom.el('b-submit').disabled, input().disabled]).toEqual(['disabled', true, true]);
    expect(dom.el('submit-status').textContent).toBe('Global tablo çevrimdışı');
    await submit();
    expect(f.submit).not.toHaveBeenCalled();
  });
  it('otomatik gönderim yok; hatırlanan takma ad önceden doldurulur', async () => {
    const f = fakeClient();
    const { p } = await panel(f.c, 'Ferah');
    p.prepare(entry(1, 500));
    expect(input().value).toBe('Ferah');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.submit).not.toHaveBeenCalled();
    expect(p.state()).toBe('idle');
  });
  it('geçersiz takma ad: aria-invalid, durum mesajı, odak girişte; ağa gidilmez', async () => {
    const f = fakeClient();
    const { p, submit } = await panel(f.c);
    p.prepare(entry(1, 500));
    input().value = '<b>';
    await submit();
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(dom.el('submit-status').textContent).toBe('Takma ad geçersiz');
    expect(dom.document.activeElement?.id).toBe('nick-input');
    expect(f.submit).not.toHaveBeenCalled();
  });
  it('başarı: gönderiliyor → gönderildi; takma ad hatırlanır, yerel kayıt işaretlenir; tekrar gönderilemez', async () => {
    const f = fakeClient();
    const { p, submit, saveNickname, updateLocal } = await panel(f.c);
    p.prepare(entry(1, 4321));
    input().value = '  Ferah   Nefes ';
    await submit();
    expect([p.state(), dom.el('submit-status').textContent, dom.el('b-submit').disabled]).toEqual([
      'sending',
      'Gönderiliyor…',
      true,
    ]);
    expect(dom.el('b-submit').getAttribute('aria-busy')).toBe('true');
    await submit(); // çift tıklama
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.submit).toHaveBeenCalledWith({
      gameId: entry(1, 0).id,
      nickname: 'Ferah Nefes',
      score: 4321,
      lines: 12,
      level: 2,
      durationSeconds: 90,
    });
    f.submits[0]?.({ ok: true });
    await flush();
    expect([p.state(), dom.el('submit-status').textContent, dom.el('b-submit').disabled, input().disabled]).toEqual([
      'sent',
      'Global tabloya gönderildi',
      true,
      true,
    ]);
    expect(saveNickname).toHaveBeenCalledWith('Ferah Nefes');
    expect(updateLocal).toHaveBeenCalledWith(entry(1, 0).id, { nickname: 'Ferah Nefes' });
    expect(updateLocal).toHaveBeenCalledWith(entry(1, 0).id, { submitted: true });
    await submit();
    p.prepare(entry(1, 4321)); // aynı oyun yeniden gösterilse de
    expect(p.state()).toBe('sent');
    expect(f.submit).toHaveBeenCalledTimes(1);
  });
  it.each<[SubmitResult, string, string, boolean]>([
    [{ ok: false, reason: 'error' }, 'failed', 'Gönderilemedi, tekrar dene', false],
    [{ ok: false, reason: 'timeout' }, 'failed', 'Gönderilemedi, tekrar dene', false],
    [{ ok: false, reason: 'offline' }, 'failed', 'Gönderilemedi, tekrar dene', false],
    [{ ok: false, reason: 'rate_limited' }, 'failed', 'Çok sık gönderim, biraz sonra tekrar dene', false],
    [{ ok: false, reason: 'duplicate' }, 'sent', 'Bu oyun zaten gönderilmiş', true],
    [{ ok: false, reason: 'invalid' }, 'sent', 'Bu skor gönderilemedi', true],
  ])('sonuç %j → %s', async (result, state, text, locked) => {
    const f = fakeClient();
    const { p, submit } = await panel(f.c, 'Ferah');
    p.prepare(entry(1, 500));
    await submit();
    f.submits[0]?.(result);
    await flush();
    expect([p.state(), dom.el('submit-status').textContent, dom.el('b-submit').disabled]).toEqual([
      state,
      text,
      locked,
    ]);
    if (!locked) {
      await submit(); // ağ hatasında kullanıcı tekrar deneyebilir
      expect(f.submit).toHaveBeenCalledTimes(2);
    }
  });
  it('gönderim sürerken yeni oyun bitti: geç gelen sonuç yeni oyunun panelini değiştirmez', async () => {
    const f = fakeClient();
    const { p, submit, updateLocal } = await panel(f.c, 'Ferah');
    p.prepare(entry(1, 500));
    await submit();
    p.prepare(entry(2, 800));
    f.submits[0]?.({ ok: true });
    await flush();
    expect([p.state(), dom.el('submit-status').textContent]).toEqual(['idle', '']);
    expect(updateLocal).toHaveBeenCalledWith(entry(1, 0).id, { submitted: true });
  });
});

describe('oyun sonu entegrasyonu (lifecycle)', () => {
  it('yerel skor otomatik ve bir kez kaydedilir; ağa hiçbir istek gitmez; panel bu oyun için hazırlanır', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    data.set('fn_nickname', '"Ferah"');
    const { createLifecycle } = await import('../../src/app/lifecycle');
    const g = createGame(1);
    const onGameRecorded = vi.fn();
    const lc = createLifecycle({ ...createAppStubs(g).deps, onGameRecorded });
    lc.start();
    g.score = 4321;
    g.lines = 23;
    g.level = 3;
    g.elapsed = 245_400;
    lc.handleGameOver('blockout');
    lc.handleGameOver('blockout'); // aynı oyun ikinci kez: tekrar kayıt yok
    const stored = JSON.parse(data.get('fn_scores') ?? '{}') as { v: number; entries: LocalScore[] };
    expect(stored.v).toBe(1);
    expect(stored.entries).toHaveLength(1);
    expect(stored.entries[0]).toMatchObject({
      nickname: 'Ferah',
      score: 4321,
      lines: 23,
      level: 3,
      durationSeconds: 245,
      submitted: false,
    });
    expect(onGameRecorded).not.toHaveBeenCalled(); // ekran 950 ms sonra açılır
    vi.advanceTimersByTime(1000);
    expect(onGameRecorded).toHaveBeenCalledWith(expect.objectContaining({ id: stored.entries[0]?.id, score: 4321 }));
    expect(dom.visibleScreen()).toBe('scr-over');
    expect(JSON.parse(data.get('fn_meta') ?? '{}')).toMatchObject({ best: 4321 }); // fn_meta.best korunur
    // yeni oyun yeni kimlik alır
    lc.start();
    g.score = 100;
    lc.handleGameOver('blockout');
    const after = JSON.parse(data.get('fn_scores') ?? '{}') as { entries: LocalScore[] };
    expect(after.entries).toHaveLength(2);
    expect(new Set(after.entries.map((e) => e.id)).size).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('storage kapalı/dolu olsa da oyun sonu akışı çalışır', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    const { createLifecycle } = await import('../../src/app/lifecycle');
    const g = createGame(1);
    const lc = createLifecycle(createAppStubs(g).deps);
    lc.start();
    expect(() => lc.handleGameOver('blockout')).not.toThrow();
    vi.advanceTimersByTime(1000);
    expect(dom.visibleScreen()).toBe('scr-over');
  });
});

describe('Skorlar işaretlemesi ve responsive tablo (statik)', () => {
  it('sekme/panel ARIA bağları, tablo başlıkları, canlı durum bölgeleri', async () => {
    const html = (await import('../../index.html?raw')).default;
    const s = html.slice(
      html.indexOf('<section id="scr-scores"'),
      html.indexOf('</section>', html.indexOf('<section id="scr-scores"')),
    );
    expect(s).toMatch(/role="tablist" aria-labelledby="scores-title"/);
    expect(s).toMatch(/role="tab"\s+id="tab-local"\s+aria-controls="panel-local"\s+aria-selected="true"/);
    expect(s).toMatch(/role="tab"\s+id="tab-global"\s+aria-controls="panel-global"\s+aria-selected="false"/);
    expect(s).toMatch(/role="tabpanel" id="panel-local" aria-labelledby="tab-local"/);
    expect(s).toMatch(/role="tabpanel" id="panel-global" aria-labelledby="tab-global"/);
    expect([...s.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1])).toEqual([
      'Sıra',
      'Takma ad',
      'Skor',
      'Satır',
      'Sıra',
      'Takma ad',
      'Skor',
      'Satır',
    ]);
    expect(s).toMatch(/id="global-status" role="status" aria-live="polite"/);
    expect(html).toMatch(/id="submit-status" role="status" aria-live="polite"/);
    expect(html).toMatch(/<label class="submit-label" for="nick-input">Takma ad<\/label>/);
    expect(html).toMatch(/aria-describedby="nick-hint submit-status"/);
  });
  it('dar ekranda taşma yok: sabit tablo düzeni, uzun ad kısaltılır; dokunma hedefleri ≥ 44 px', async () => {
    const { rule } = await import('../helpers/css');
    expect(rule('.score-table')).toMatch(/table-layout: fixed/);
    expect(rule('.score-table th,\n.score-table td')).toMatch(/text-overflow: ellipsis/);
    expect(rule('.tab')).toMatch(/min-height: 44px/);
    expect(rule('.submit-row input')).toMatch(/min-height: 44px/);
    expect(rule('.submit-row')).toMatch(/grid-template-columns: minmax\(0, 1fr\) auto/);
    expect(rule('.tab:focus-visible,\n.tab-panel:focus-visible')).toMatch(
      /outline: 3px solid var\(--color-focus-ring\)/,
    );
  });
});
