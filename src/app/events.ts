/* =====================================================================
   GAME EVENTS -> view/audio/haptics/UI/analitik bağlantıları
   NS4-03: main.ts'ten taşındı. Olay adları, işleyici içerikleri ve aynı olay
   için kayıt sırası korunmuştur; yeni olay adı veya event-bus yoktur.
   NS4-22: büyük açılma anı (Tetris, Tam Ferahlık, oda açılışı): görsel,
   ses, ekran ışığı. scored/allclear clearstart'tan önce yayılır; an
   temizleme başlarken oynar.
   ===================================================================== */
import type { Game } from '../game/Game';
import type { View } from '../rendering/GameView';
import type { Sound } from '../audio/SoundManager';
import type { Lifecycle } from './lifecycle';
import { HAPTIC, type Buzz } from '../haptics/haptics';
import { track } from '../analytics/analytics';
import { popup, toast } from '../ui/notifications';
import { award } from '../ui/badges';
import { CLOUD_HINT, ROOM_GOAL, roomText } from '../content/rooms';
import { hideRoomMap, showRoomMap } from '../ui/sinusMap';
import { PIECE } from '../game/pieces';
import { COLS } from '../config/gameConfig';
import { ROOMS } from '../config/gameConfig';
import { FULL_RELIEF, FULL_RELIEF_SUB } from '../content/relief';
import { drainCongestion, fmt, reliefFlash } from '../ui/hud';

export interface WireDeps {
  game: Game;
  view: View;
  sound: Sound;
  buzz: Buzz;
  lifecycle: Pick<Lifecycle, 'handleGameOver' | 'showFinal'>;
}

export function wireGameEvents({ game, view, sound, buzz, lifecycle }: WireDeps) {
  game.on('move', () => sound.move());
  game.on('rotate', () => sound.rotate());
  game.on('hold', () => sound.hold());
  // NS4-17: Game hard drop'ta önce 'harddrop', hemen ardından (aynı çağrıda) 'lock' yayar. Hard drop kendi daha
  // güçlü sesi ve titreşimiyle duyulur; oturma sesi/titreşimi üst üste binmesin diye o kilitlenmede atlanır.
  let hardLock = false;
  game.on('harddrop', (d) => {
    view.onHard(d);
    sound.hard();
    buzz(HAPTIC.hard);
    hardLock = true;
  });
  game.on('lock', (cells) => {
    view.onLock(cells);
    if (hardLock) {
      hardLock = false;
      return;
    }
    sound.lock();
    buzz(HAPTIC.lock);
  });
  // NS4-22: sıradaki satır temizlemesinin açılma anı (scored → allclear → clearstart). Odada Tam Ferahlık olursa
  // oda da hemen açılır (tahtada gri bulutçuk kalmaz): an, oda açılışında tek ve en güçlü hâliyle oynar.
  let relief: 'tetris' | 'allclear' | null = null;
  let roomRelief = false;
  // NS4-30: 1. odada ilk bulutçuk uçunca tek seferlik ipucu (oyun başına; temizlenen satırda gri hücre var mı)
  let cloudHint = false;
  game.on('clearstart', (e) => {
    view.onClearStart(e);
    if (!cloudHint && game.rooms && game.room === 0 && e.kind !== 'room') {
      const b = game.board;
      if (e.rows.some((r) => b.subarray(r * COLS, r * COLS + COLS).includes(PIECE.GARBAGE))) {
        cloudHint = true;
        toast(CLOUD_HINT);
      }
    }
    if (e.kind === 'lines' && relief) {
      view.relief(relief);
      sound.relief(relief);
      reliefFlash(relief);
    }
    relief = null;
    if (e.kind === 'cyc') {
      sound.cyc();
      buzz(HAPTIC.cyc);
      popup('Sıklamen özütü', 'Alt satırlar temizleniyor', 'cyc');
    } else if (e.kind === 'sneeze') {
      sound.sneeze();
      buzz(HAPTIC.sneeze);
      popup('HAPŞUU!', 'Çok yaşa!', 'sneeze');
    }
  });
  // NS4-03: powerup_use analitiği Game.useCyc/useSyn içinden buraya taşındı. Orijinalde track() emit('clearstart')
  // çağrısından hemen sonra çalışıyordu; bu işleyici yukarıdakinden sonra kaydedildiği için sıra ve payload aynıdır.
  game.on('clearstart', (e) => {
    if (e.kind === 'cyc')
      track('powerup_use', { kind: 'siklamen', level: game.level, congestion: +game.congestion().toFixed(2) });
    else if (e.kind === 'sneeze') track('powerup_use', { kind: 'hapsirik', uses: game.sneezeUses, level: game.level });
  });
  game.on('clearend', () => view.onClearEnd());
  game.on('scored', (e) => {
    view.onScored(e); // NS4-15: temizleme dili (Ozmotik / Nörorefleks); Game bunu clearstart'tan önce yayar
    sound.clear(e.n, e.tspin);
    if (e.n) buzz(HAPTIC.clear(e.n));
    // NS4-19: oyundaki ilk drenaj (Game, scored'u satır toplamını artırmadan önce yayar: game.lines henüz 0)
    if (e.n > 0 && game.lines === 0)
      track('first_drain', { lines: e.n, level: game.level, dur_s: Math.round(game.elapsed / 1000) });
    const names = ['', 'Tek', 'Çift', 'Üçlü', 'TETRİS'];
    let big = '',
      sub = '',
      cls = '';
    if (e.tspin) {
      big = (e.tspin === 1 ? 'Mini ' : '') + 'T-spin' + (e.n ? ' ' + names[e.n].toLowerCase() : '');
      sub = 'Usta hamle!';
      cls = 'cyc';
    } else if (e.n === 4) {
      big = 'TETRİS';
      sub = 'Dört satır birden!';
      cls = 'cyc';
    } else if (e.n >= 2) {
      big = names[e.n] + ' satır';
    }
    if (e.b2b) sub = 'Art arda · ' + sub;
    if (e.combo >= 2) {
      if (!big) big = `Kombo ×${e.combo}`;
      else sub = (sub ? sub + ' · ' : '') + `kombo ×${e.combo}`;
    }
    if (big) popup(big, sub, cls);
    if (e.n === 4) {
      award('ozmotik');
      relief = 'tetris';
    }
    if (e.tspin && e.n) award('noro');
    if (e.combo >= 5) award('akis');
  });
  game.on('levelup', (lv) => {
    sound.level();
    popup(`Seviye ${lv}`, 'Bloklar hızlanıyor');
    track('level_up', { level: lv });
  });
  // NS4-24: sentetik açıcı / rebound / garbage kaldırıldı; hapşırık rozeti
  game.on('powerdone', (e) => {
    if (e.kind === 'sneeze' && game.sneezeUses >= 3) award('hapsu');
  });
  // NS4-27: Sinüs Odaları
  game.on('roomstart', (e) => {
    if (e.room === 0) cloudHint = false; // yeni oyun
    hideRoomMap();
    track('room_start', { room: e.room, gray: e.gray });
    if (e.room < ROOMS.length) popup(`${e.room + 1}. oda · ${roomText(e.room).name}`, ROOM_GOAL);
    else lifecycle.showFinal(); // NS4-31: dört sinüs açık: final ekranı (Serbest nefes popup'ı devam edilince)
  });
  game.on('allclear', (e) => {
    drainCongestion(game); // NS4-42: tahta tertemiz: gösterge animasyonla sıfırlanır
    buzz(HAPTIC.allClear);
    popup(FULL_RELIEF, `${FULL_RELIEF_SUB} · +${fmt(e.bonus)}`, 'cyc');
    track('all_clear', { lines: e.lines, level: game.level, bonus: e.bonus });
    if (game.rooms && game.room < ROOMS.length) {
      relief = null;
      roomRelief = true;
    } else relief = 'allclear';
  });
  game.on('roomclear', (e) => {
    drainCongestion(game); // NS4-42: oda açıldı: tıkanıklık göstergesi animasyonla sıfırlanır
    view.onRoomClear();
    view.relief(roomRelief ? 'allclear' : 'room');
    sound.roomClear();
    reliefFlash(roomRelief ? 'allclear' : 'room');
    if (!roomRelief) buzz(HAPTIC.room);
    roomRelief = false;
    showRoomMap(e.room, e.bonus); // NS4-31: "Sinüs açıldı!" + harita (eski popup'ın yerine)
    track('room_clear', {
      room: e.room,
      level: game.level,
      dur_s: Math.round(game.elapsed / 1000),
      bonus: e.bonus,
    });
  });
  game.on('gameover', (reason) => lifecycle.handleGameOver(reason));
}
