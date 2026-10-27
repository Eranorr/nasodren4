/* =====================================================================
   LIFECYCLE: uygulama durumu (menu | playing | paused | over) ve geçişler
   start / pause / resume / toMenu / oyun sonu akışı. Oyun kuralı hesaplamaz;
   Game, View, Sound, input, UI, storage ve analitiği birbirine bağlar.
   NS4-03: main.ts'ten taşındı; adımların sırası değişmedi.
   ===================================================================== */
import type * as PIXI from 'pixi.js';
import type { Game } from '../game/Game';
import type { View } from '../rendering/GameView';
import type { Sound } from '../audio/SoundManager';
import type { AppState } from '../types/app';
import type { GameOverReason } from '../types/game';
import { HAPTIC, type Buzz } from '../haptics/haptics';
import { meta, saveMeta } from '../storage/progress';
import { track } from '../analytics/analytics';
import { hideDanger, forgetDanger, clearSessionHud } from '../ui/hud';
import { award, resetNewBadges } from '../ui/badges';
import { setTip, show, renderGameOver } from '../ui/screens';
import { renderFinal } from '../ui/sinusMap';
import { popup } from '../ui/notifications';
import { FREE_GOAL, FREE_NAME } from '../content/rooms';
import type { Tutorial } from '../tutorial/Tutorial';
import { addLocalScore, type LocalScore } from '../leaderboard/localScores';
import { loadNickname, newGameId } from '../leaderboard/nickname';

export interface LifecycleDeps {
  game: Game;
  view: View;
  sound: Sound;
  app: PIXI.Application<HTMLCanvasElement>;
  buzz: Buzz;
  /** Input durumunu sıfırlar (InputController.reset). */
  resetInput: () => void;
  /** NS4-12: ilk oyun öğreticisi (isteğe bağlı; testlerde verilmeyebilir). */
  tutorial?: Pick<Tutorial, 'onGameStart' | 'onPause' | 'onResume' | 'onSessionEnd'>;
  /** NS4-18: oyun sonu ekranı açılmadan hemen önce (global gönderim paneli bu oyun için hazırlanır). */
  onGameRecorded?: (entry: LocalScore) => void;
  /** NS4-27: Sinüs Odaları akışı (varsayılan açık; eski davranışı sınayan testler kapatır). */
  rooms?: boolean;
}

export interface Lifecycle {
  readonly getState: () => AppState;
  readonly start: () => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly toMenu: () => void;
  readonly showOver: (isBest: boolean, entry?: LocalScore) => void;
  readonly handleGameOver: (reason: GameOverReason) => void;
  /** NS4-31: dört sinüs açıldı: oyun durur, final ekranı. */
  readonly showFinal: () => void;
  /** NS4-31: final → Serbest nefes (oyun sürer). */
  readonly continueFree: () => void;
  /** NS4-31: final → oyunu burada bitir (oyun sonu, başlık "Bütün sinüsler açık!"). */
  readonly finish: () => void;
}

export function createLifecycle({
  game,
  view,
  sound,
  app,
  buzz,
  resetInput,
  tutorial,
  onGameRecorded,
  rooms = true,
}: LifecycleDeps): Lifecycle {
  let appState: AppState = 'menu';
  /** NS4-18: oyun başına kimlik (yerel kayıt tekrarını ve global tekrar gönderimi engeller). */
  let gameId = newGameId();
  let recordedId: string | null = null;
  /** NS4-31: oyun final ekranında "Bitir" ile bitti (oyun sonu başlığı ve sesi). */
  let completed = false;
  /** NS4-31: final ekranı açık: yalnızca seçim (devam / bitir) kapatır; resume() dokunmaz. */
  let finalOpen = false;

  function start() {
    sound.unlock();
    // NS4-07: önceki oturumdan kalan rozet/toast/popup temizlenir (önceden yalnızca resetHud).
    // NS4-27: reset'ten önce: yeni oyunun ilk oda popup'ı (roomstart) silinmesin.
    clearSessionHud();
    resetNewBadges();
    completed = false;
    finalOpen = false;
    game.reset({ rooms }); // NS4-27: Sinüs Odaları
    gameId = newGameId();
    view.resetFx(); // NS4-15: overT, anim, dalga ve flaşlar ile yeni efekt katmanları ve parçacıklar
    view.syncAll();
    resetInput();
    appState = 'playing';
    show(null);
    sound.setMusic(true);
    tutorial?.onGameStart();
    track('game_start', { best: meta.best });
  }
  function pause() {
    if (appState !== 'playing') return;
    appState = 'paused';
    requestAnimationFrame(() => {
      if (appState === 'paused') app.ticker.stop();
    });
    resetInput();
    setTip('tip-pause');
    show('scr-pause');
    sound.setMusic(false);
    hideDanger();
    forgetDanger();
    tutorial?.onPause(); // NS4-12: kart gizlenir, adım korunur
  }
  function resume() {
    if (appState !== 'paused' || finalOpen) return;
    app.ticker.start();
    appState = 'playing';
    show(null);
    sound.setMusic(true);
    tutorial?.onResume();
  }
  function toMenu() {
    finalOpen = false;
    app.ticker.start();
    appState = 'menu';
    setTip('tip-start');
    show('scr-start');
    sound.setMusic(false);
    // NS4-07: yarım oyunun geçici HUD durumu menüde kalmaz (skor bilerek kaydedilmez, NS4-01 Not E)
    clearSessionHud();
    tutorial?.onSessionEnd(); // yarım öğretici tamamlanmış sayılmaz
  }
  function showOver(isBest: boolean, entry?: LocalScore) {
    if (entry) onGameRecorded?.(entry);
    renderGameOver({ score: game.score, lines: game.lines, best: meta.best, isBest, complete: completed });
  }
  /**
   * NS4-31: son oda açıldı (Serbest nefese girildi). Oyun pause gibi durur ama müzik sürer; final ekranı açılır.
   * Escape/P final ekranını kapatmaz (seçim gerekir); sekme gizlenince pause() durumu değiştirmez.
   */
  function showFinal() {
    if (appState !== 'playing') return;
    appState = 'paused';
    requestAnimationFrame(() => {
      if (appState === 'paused') app.ticker.stop();
    });
    resetInput();
    hideDanger();
    forgetDanger();
    renderFinal(game);
    finalOpen = true;
    show('scr-final');
    tutorial?.onPause();
  }
  function leaveFinal(choice: 'continue' | 'finish') {
    finalOpen = false;
    app.ticker.start();
    appState = 'playing';
    show(null);
    track('final_choice', { choice, dur_s: Math.round(game.elapsed / 1000) });
  }
  function continueFree() {
    if (!finalOpen) return;
    leaveFinal('continue');
    tutorial?.onResume();
    popup(FREE_NAME, FREE_GOAL, 'cyc');
  }
  function finish() {
    if (!finalOpen) return;
    leaveFinal('finish');
    completed = true;
    game.gameOver('complete'); // → handleGameOver
  }
  /** NS4-18: tamamlanan oyunu yerel skor listesine yazar (aynı oyun bir kez). Ağa hiçbir şey göndermez. */
  function recordLocal(): LocalScore {
    const entry: LocalScore = {
      id: gameId,
      nickname: loadNickname(),
      score: game.score,
      lines: game.lines,
      level: game.level,
      durationSeconds: Math.max(1, Math.round(game.elapsed / 1000)),
      recordedAt: Date.now(),
      submitted: false,
    };
    if (recordedId !== gameId) {
      recordedId = gameId;
      addLocalScore(entry);
    }
    return entry;
  }

  /**
   * Game 'gameover' olayı: skor bu noktada kesinleşir. Yerel ilerleme ve analitik burada yazılır.
   * Gelecekteki global skor gönderimi de buraya (yerel kayıttan sonra, Game'in dışında) bağlanmalıdır.
   * Not: Ana menüye çıkılan yarım oyun için bu akış çalışmaz (NS4-01 Not E, bilerek korunur).
   */
  function handleGameOver(reason: GameOverReason) {
    // NS4-31: final ekranından bitiş yenilgi değildir: yığın griye dönmez, üzgün ses/titreşim yok
    if (reason === 'complete') sound.level();
    else {
      view.onGameOver();
      sound.over();
      buzz(HAPTIC.over);
    }
    sound.setMusic(false);
    resetInput();
    appState = 'over';
    hideDanger();
    meta.totalLines += game.lines;
    if (meta.totalLines >= 100) award('derin');
    const isBest = game.score > meta.best;
    if (isBest) meta.best = game.score;
    saveMeta();
    const entry = recordLocal();
    track('game_over', {
      reason,
      score: game.score,
      level: game.level,
      lines: game.lines,
      dur_s: Math.round(game.elapsed / 1000),
      cyc_used: game.cycUsed,
      sneeze_uses: game.sneezeUses,
      rooms_cleared: game.roomsCleared,
      tetrises: game.tetrises,
      all_clears: game.allClears,
    });
    setTimeout(() => showOver(isBest, entry), 950);
    tutorial?.onSessionEnd();
  }

  return {
    getState: () => appState,
    start,
    pause,
    resume,
    toMenu,
    showOver,
    handleGameOver,
    showFinal,
    continueFree,
    finish,
  };
}
