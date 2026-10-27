/* =====================================================================
   NS4-31: sinüs haritası: yüz silüetinde dört sinüs (index.html'de iki
   kopya: oda açılış kartı #rmap, final ekranı #fmap). Her sinüsün durumu
   kapsayıcının data-<oda id> niteliğine yazılır; renk ve hareket CSS'tedir
   (SVG öğelerine doğrudan dokunulmaz).
   ===================================================================== */
import { ROOMS } from '../config/gameConfig';
import { ROOM_NEXT_FINAL, roomText } from '../content/rooms';
import { $ } from './dom';
import { fmt } from './hud';

/** kapalı (tıkalı leylak) · sıradaki (sıklamen nabzı) · şimdi açılıyor (büyüyüp turkuaz olur) · açık (turkuaz). */
export type SinusState = 'closed' | 'next' | 'opening' | 'open';

/** `opening` indeksli oda şimdi açılıyor: öncekiler açık, bir sonraki "sıradaki", gerisi kapalı. */
export function mapStates(opening: number): SinusState[] {
  return ROOMS.map((_, i) =>
    i < opening ? 'open' : i === opening ? 'opening' : i === opening + 1 ? 'next' : 'closed',
  );
}

export function renderMap(el: HTMLElement, states: readonly SinusState[]): void {
  ROOMS.forEach((r, i) => {
    el.dataset[r.id] = states[i] ?? 'closed';
  });
}

/** Oda açılış kartı: "Sinüs açıldı!", oda adı + bonus, harita ve sıradaki oda (geçiş boyunca). */
export function showRoomMap(room: number, bonus: number): void {
  renderMap($('rmap'), mapStates(room));
  $('rm-sub').textContent = `${roomText(room).name} ferahladı · +${fmt(bonus)}`;
  $('rm-next').textContent = room + 1 < ROOMS.length ? `Sıradaki: ${roomText(room + 1).name}` : ROOM_NEXT_FINAL;
  $('room-map').classList.add('on');
}
export function hideRoomMap(): void {
  $('room-map').classList.remove('on');
}

/** Final ekranı: bütün sinüsler açık, o ana kadarki puan ve drenaj. */
export function renderFinal(r: { readonly score: number; readonly lines: number }): void {
  renderMap(
    $('fmap'),
    ROOMS.map(() => 'open'),
  );
  $('f-score').textContent = fmt(r.score);
  $('f-lines').textContent = String(r.lines);
}
