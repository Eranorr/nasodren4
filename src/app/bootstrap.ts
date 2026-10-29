/* =====================================================================
   BOOT: sistemleri oluşturur ve bağlar. Başlatma sırası NS4-01/NS4-02
   referansıyla aynıdır:
   Game → Sound → Pixi Application → canvas → View → resize dinleyicileri →
   lifecycle + olay bağlantıları → input → ipuçları/ekranlar → butonlar/CTA →
   ayarlar → ana döngü → ilk ipucu → doLayout → fontlar hazır olunca yeniden layout.
   ===================================================================== */
import * as PIXI from 'pixi.js';
import type { Layout } from '../types/layout';
import { Game } from '../game/Game';
import { View } from '../rendering/GameView';
import { computeLayout } from '../rendering/layout';
import { Sound } from '../audio/SoundManager';
import { InputController } from '../input/InputController';
import { createBuzz } from '../haptics/haptics';
import { settings, saveSettings } from '../storage/settings';
import { track } from '../analytics/analytics';
import { ctaUrl } from '../analytics/cta';
import { bindUiAnalytics } from '../analytics/funnel';
import { $ } from '../ui/dom';
import { updateHud, applyHudLayout, shownCongestion } from '../ui/hud';
import { NextReveal } from '../ui/nextReveal';
import { toast } from '../ui/notifications';
import { createTutorialView } from '../ui/tutorialView';
import { Tutorial } from '../tutorial/Tutorial';
import { TUTORIAL_DONE_TEXT } from '../tutorial/steps';
import { tutorialStore } from '../storage/tutorial';
import { initTips, setTip, openSub, bindBackButtons, closeSub, initScreens, renderStartBest } from '../ui/screens';
import { meta } from '../storage/progress';
import { leaderboardConfig } from '../leaderboard/config';
import { createLeaderboardClient } from '../leaderboard/globalClient';
import { loadLocalScores, updateLocalScore } from '../leaderboard/localScores';
import { loadNickname, saveNickname } from '../leaderboard/nickname';
import { createScoresView } from '../ui/scoresView';
import { createSubmitPanel } from '../ui/submitScore';
import { bindSettingsPanel } from '../ui/settingsPanel';
import { createLifecycle } from './lifecycle';
import { wireGameEvents } from './events';
import { watchReducedMotion } from './motion';
import { setWallsReducedMotion } from '../ui/sinusWalls';

export function bootstrap(): void {
  const stageEl = $('stage');
  const game = new Game();
  const sound = new Sound(settings);
  // NS4-17: sekme gizlenince AudioContext askıya alınır, görünür olunca sürer (oyun zaten otomatik molaya girer)
  document.addEventListener('visibilitychange', () => sound.setHidden(document.hidden));
  // NS4-39: ana menüde "Bahçe" müziği. Tarayıcılar sesi ilk etkileşime kadar açmaz: sayfadaki ilk dokunuş veya
  // tuşta açılır (sonraki etkileşimler askıdaki context'i sürdürür; unlock() tekrarlarda yeni context açmaz).
  sound.setMusic('menu');
  for (const ev of ['pointerdown', 'keydown'] as const)
    document.addEventListener(ev, () => sound.unlock(), { capture: true, passive: true });
  // haptik: ayar her çağrıda okunur
  const buzz = createBuzz(() => settings.haptics);

  const app = new PIXI.Application<HTMLCanvasElement>({
    backgroundAlpha: 0,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    powerPreference: 'high-performance',
    width: stageEl.clientWidth,
    height: stageEl.clientHeight,
  });
  stageEl.appendChild(app.view);
  // Not: ticker.maxFPS bilerek ayarlanmıyor; Pixi'nin kare atlama mantığı 60Hz ekranda
  // rAF jitter'ı yüzünden kare düşürebiliyor. Mantık zaman tabanlı, 120Hz'de de doğru çalışır.
  const view = new View(app, game, settings);
  // NS4-15: hareketi azalt tercihi Pixi efektlerine de uygulanır (sarsıntı/parçacık azalır, süreler aynı)
  watchReducedMotion((reduced) => {
    view.reducedMotion = reduced;
    setWallsReducedMotion(reduced); // NS4-33
  });
  let L: Layout | null = null;

  function doLayout() {
    const W = stageEl.clientWidth,
      H = stageEl.clientHeight;
    if (!W || !H) return;
    app.renderer.resize(W, H);
    L = computeLayout(W, H);
    applyHudLayout(L);
    tutorialView.layout(L);
    // NS4-13: yeniden yerleşimde süren dokunmatik jest iptal edilir (hücre ve tahta konumu değişti)
    input.cancelGesture();
    view.layout(L);
    app.render();
  }
  let layoutQueued = false;
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      layoutQueued = false;
      doLayout();
    });
  }
  window.addEventListener('resize', queueLayout);
  if (window.ResizeObserver) new ResizeObserver(queueLayout).observe(stageEl);

  // input, lifecycle'dan sonra oluşturulur; lifecycle ona yalnızca çalışma anında (callback ile) erişir
  // NS4-12: ilk oyun öğreticisi. Yalnızca Game olaylarını ve input bildirimlerini dinler; kontrolleri engellemez.
  // Başlangıç anlatımı: dokunmatik ekranlı cihazda jest, değilse klavye; son kullanılan girişe göre değişir.
  const tutorialView = createTutorialView({ skip: () => tutorial.skip(), done: () => tutorial.acknowledge() });
  const tutorial = new Tutorial(game, tutorialView, tutorialStore, {
    mode: navigator.maxTouchPoints > 0 ? 'touch' : 'keyboard',
    onComplete: () => toast(TUTORIAL_DONE_TEXT),
    track,
  });
  // NS4-18: yerel + global skor. Ortam değişkenleri yoksa istemci devre dışıdır (oyun ve yerel tablo çalışır).
  const leaderboard = createLeaderboardClient(leaderboardConfig);
  const submitPanel = createSubmitPanel({
    client: leaderboard,
    loadNickname,
    saveNickname,
    updateLocal: updateLocalScore,
  });
  const scoresView = createScoresView({ client: leaderboard, loadLocal: loadLocalScores });
  const lifecycle = createLifecycle({
    game,
    view,
    sound,
    app,
    buzz,
    resetInput: () => input.reset(),
    tutorial,
    onGameRecorded: (entry) => submitPanel.prepare(entry),
  });
  wireGameEvents({ game, view, sound, buzz, lifecycle });

  const input = new InputController({
    game,
    canvas: app.view,
    settings,
    getState: lifecycle.getState,
    getCell: () => L!.cell, // pointer olayları yalnızca oynarken, ilk layout'tan sonra gelir
    getBoard: () => L!.board,
    pause: lifecycle.pause,
    resume: lifecycle.resume,
    closeSub,
    unlockAudio: () => sound.unlock(),
    onSoftDrop: () => tutorial.softDrop(),
    onInputMode: (mode) => tutorial.setMode(mode),
  });

  // ekranlar
  initTips();
  bindBackButtons();
  initScreens(); // NS4-10: başlangıç ekranı açıkken arka plan inert
  // NS4-19: CTA / Tekrar oyna / Skorlar huni olayları (davranış dinleyicilerinden önce bağlanır)
  bindUiAnalytics({ getState: lifecycle.getState, getScore: () => game.score, getLevel: () => game.level });
  $('b-play').addEventListener('click', lifecycle.start);
  $('b-again').addEventListener('click', lifecycle.start);
  $('b-menu').addEventListener('click', lifecycle.toMenu);
  $('b-quit').addEventListener('click', lifecycle.toMenu);
  $('b-resume').addEventListener('click', lifecycle.resume);
  // NS4-31: final ekranı
  $('b-free').addEventListener('click', lifecycle.continueFree);
  $('b-finish').addEventListener('click', lifecycle.finish);
  $('b-how').addEventListener('click', () => openSub('scr-how'));
  // "Nasıl oynanır" → öğreticiyi baştan göstererek yeni oyun başlatır
  $('b-tutorial').addEventListener('click', () => {
    tutorial.restart();
    lifecycle.start();
  });
  $('b-set1').addEventListener('click', () => openSub('scr-set'));
  $('b-scores').addEventListener('click', () => {
    scoresView.open();
    openSub('scr-scores');
  });
  $('b-set2').addEventListener('click', () => openSub('scr-set'));
  $('cta-over', HTMLAnchorElement).href = ctaUrl('game_over');
  $('cta-pause', HTMLAnchorElement).href = ctaUrl('pause_menu');

  // ayarlar
  bindSettingsPanel({
    settings,
    save: saveSettings,
    onAudioChange: (k) => {
      sound.applySettings();
      if (k === 'sfxVol' || k === 'sound') sound.preview(); // NS4-39: efekt düzeyi duyulsun
    },
  });

  // NS4-38: sıradaki parça "?" kartıyla açılır; sesler oynanış ses kanalından (Ses ayarı kapalıysa çalmaz)
  const reveal = new NextReveal(view, sound, () => view.reducedMotion);

  /* ---- ana döngü ---- */
  let fpsAcc = 0,
    fpsFrames = 0,
    fpsWorst = 0;
  app.ticker.add(() => {
    const raw = app.ticker.deltaMS;
    const dt = Math.min(raw, 100); // sekme dönüşü gibi uzun boşluklarda patlama yok
    if (lifecycle.getState() === 'playing') {
      input.update(dt);
      game.update(dt);
    }
    view.update(dt);
    const appState = lifecycle.getState(); // game.update içinde 'over' olmuş olabilir; orijinaldeki gibi burada okunur
    if (appState === 'playing' || appState === 'over') {
      updateHud(game, appState === 'playing');
      reveal.update(game, dt, appState === 'playing'); // NS4-38: "Sıradaki" gizem kartı
    }
    // NS4-20: tıkalı burun: müzik tıkanıklıkla boğuklaşır; oyun dışında açık
    // NS4-42: gösterilen değer (oda açılınca boşalan gösterge): müzik de birlikte ferahlar
    sound.setCongestion(appState === 'playing' ? shownCongestion(game) : 0);
    // NS4-40: oyun müziği bağlamı: seviye tempoyu hafifçe artırır, her sinüs odasında ton değişir
    if (appState === 'playing') sound.setMusicContext(game.level, game.rooms ? game.room : 0);
    if (settings.fps) {
      fpsAcc += raw;
      fpsFrames++;
      if (raw > fpsWorst) fpsWorst = raw;
      if (fpsAcc >= 500) {
        $('fps').textContent = `${Math.round((fpsFrames * 1000) / fpsAcc)} fps · en kötü ${fpsWorst.toFixed(1)} ms`;
        fpsAcc = 0;
        fpsFrames = 0;
        fpsWorst = 0;
      }
    }
  });

  setTip('tip-start');
  renderStartBest(meta.best); // NS4-41
  // NS4-19: oyun yüklendi (sayfa başına bir kez). Kişisel veri yok: yalnızca iki durum bayrağı.
  track('game_loaded', { global_scores: leaderboard.enabled, tutorial_done: tutorialStore.isDone() });
  // document.fonts eski tarayıcılarda yoktur (DOM tipleri her zaman var sayar). FontFaceSet varsa ready her zaman tanımlıdır.
  const fontSet: FontFaceSet | undefined = document.fonts;
  const fontsReady: Promise<unknown> = fontSet
    ? Promise.race([fontSet.ready, new Promise((r) => setTimeout(r, 1200))])
    : Promise.resolve();
  doLayout();
  // Sonuç beklenmez (orijinal davranış); hazır olunca layout yeniden hesaplanır. Bu promise reddedilmez.
  void fontsReady.then(queueLayout);
  // hata ayıklama (yalnızca development; production build'de global debug erişimi yok)
  if (import.meta.env.DEV) {
    const fn: NonNullable<Window['__fn']> = { game, view, app };
    window.__fn = fn;
    // NS4-15: efekt gösterimi (__fn.fx); NS4-16: yardımcı ekran gösterimi (__fn.ui).
    // Dinamik importlar production paketinde yer almaz.
    void import('../dev/fxDemo').then(({ createFxDemo }) => {
      fn.fx = createFxDemo(view, game);
    });
    void import('../dev/screensDemo').then(({ createScreensDemo }) => {
      fn.ui = createScreensDemo(lifecycle, game);
    });
    // NS4-17: ses/haptik gösterimi (__fn.sfx); yalnızca kullanıcı etkileşiminden sonra çalar
    void import('../dev/audioDemo').then(({ createAudioDemo }) => {
      fn.sfx = createAudioDemo(sound, buzz);
    });
  }
}
