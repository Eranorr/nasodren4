/* =====================================================================
   GAME EVENTS -> view/audio/haptics/UI/analitik bağlantıları
   NS4-03: main.ts'ten taşındı. Olay adları, işleyici içerikleri ve aynı olay
   için kayıt sırası korunmuştur; yeni olay adı veya event-bus yoktur.
   ===================================================================== */
import type { Game } from '../game/Game';
import type { View } from '../rendering/GameView';
import type { Sound } from '../audio/SoundManager';
import type { Lifecycle } from './lifecycle';
import { HAPTIC, type Buzz } from '../haptics/haptics';
import { track } from '../analytics/analytics';
import { popup } from '../ui/notifications';
import { award } from '../ui/badges';
import { ALL_CLEAR, FREE_GOAL, ROOM_CLEAR, ROOM_GOAL, roomText } from '../content/rooms';
import { ROOMS } from '../config/gameConfig';
import { fmt } from '../ui/hud';

export interface WireDeps {
  game: Game;
  view: View;
  sound: Sound;
  buzz: Buzz;
  lifecycle: Pick<Lifecycle, 'handleGameOver'>;
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
  game.on('clearstart', (e) => {
    view.onClearStart(e);
    if (e.kind === 'cyc') {
      sound.cyc();
      buzz(HAPTIC.cyc);
      popup('Sıklamen özütü', 'Ozmotik drenaj başladı', 'cyc');
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
      sub = 'Nörorefleks etki';
      cls = 'cyc';
    } else if (e.n === 4) {
      big = 'TETRİS';
      sub = 'Ozmotik etki: dört satır birden';
      cls = 'cyc';
    } else if (e.n >= 2) {
      big = names[e.n] + ' drenaj';
    }
    if (e.b2b) sub = 'Art arda · ' + sub;
    if (e.combo >= 2) {
      if (!big) big = `Kombo ×${e.combo}`;
      else sub = (sub ? sub + ' · ' : '') + `kombo ×${e.combo}`;
    }
    if (big) popup(big, sub, cls);
    if (e.n === 4) award('ozmotik');
    if (e.tspin && e.n) award('noro');
    if (e.combo >= 5) award('akis');
  });
  game.on('levelup', (lv) => {
    sound.level();
    popup(`Nefes seviyesi ${lv}`, 'Mukus daha hızlı birikiyor');
    track('level_up', { level: lv });
  });
  // NS4-24: sentetik açıcı / rebound / garbage kaldırıldı; hapşırık rozeti
  game.on('powerdone', (e) => {
    if (e.kind === 'sneeze' && game.sneezeUses >= 3) award('hapsu');
  });
  // NS4-27: Sinüs Odaları
  game.on('roomstart', (e) => {
    if (e.room < ROOMS.length) popup(`${e.room + 1}. oda · ${roomText(e.room).name}`, ROOM_GOAL);
    else popup(ALL_CLEAR, FREE_GOAL, 'cyc');
    track('room_start', { room: e.room, gray: e.gray });
  });
  game.on('roomclear', (e) => {
    view.onRoomClear();
    sound.roomClear();
    buzz(HAPTIC.room);
    popup(ROOM_CLEAR, `${roomText(e.room).name} ferahladı · +${fmt(e.bonus)}`, 'cyc');
    track('room_clear', {
      room: e.room,
      level: game.level,
      dur_s: Math.round(game.elapsed / 1000),
      bonus: e.bonus,
    });
  });
  game.on('gameover', (reason) => lifecycle.handleGameOver(reason));
}
