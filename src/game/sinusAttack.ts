/* =====================================================================
   SİNÜZİT ATAĞI VE SPRAY (kural seti sinus-attack-spray-v1;
   docs/SINUS-ATTACK-AND-SPRAY-FINAL.md):
   - Sinüzit Atağı: bar yalnızca aktif oynanışta dolar (SINUS.attackMs).
     Dolunca alttan tek boşluklu bir gri satır gelir (tahta bir sıra yukarı
     kayar) ve görünür alt SINUS.attackZoneRows sıranın boş hücrelerine en
     çok SINUS.attackScatter dağınık gri düşer.
   - Spray: standart satır temizlemesinde kırılan renkli hücrelerle dolar;
     yalnızca atak kaynaklı grileri hedefler (en çok SINUS.sprayCells).
   - Hücre kaynağı (Game.origin): her gri oda ya da atak kaynaklıdır. Oda
     hedefi, Sıklamen çekirdeği ve Sıklamen gücü atak grisini görmez; atak
     grisi oda geçişinde yeni odaya taşınır; atak grisi içeren tam satır
     puan, satır, seviye, kombo ve B2B üretmez.
   Bütün rastgele seçimler oyunun tohumlu akışlarından gelir (Math.random yok).
   ===================================================================== */
import { COLS, ROWS } from '../config/gameConfig';
import { PIECE } from './pieces';

export const SINUS = {
  /** Sinüzit Atağı barının dolma süresi (ms; yalnızca aktif oynanışta ilerler). */
  attackMs: 60_000,
  /** Atak başına alt bölgeye dağılan gri hedefi (uygun yer yoksa daha az) ve bölgenin yüksekliği (sıra). */
  attackScatter: 3,
  attackZoneRows: 8,
  /** Spray: hazır olması için kırılan renkli hücre sayısı ve kullanım başına en çok silinen atak grisi. */
  sprayThreshold: 30,
  sprayCells: 8,
} as const;

/**
 * Hücre kaynağı (Game.origin; tahtayla aynı boyutta ayrı katman, board değeri değişmez): gri bulutçuğun nereden
 * geldiği. Renkli ve boş hücrelerde 0.
 */
export const ORIGIN = { none: 0, room: 1, attack: 2 } as const;

/** Atak kaynaklı gri mi. */
export const isAttackGray = (board: Uint8Array, origin: Uint8Array, k: number): boolean =>
  board[k] === PIECE.GARBAGE && origin[k] === ORIGIN.attack;

/** [0, n) aralığında tamsayı. */
const pick = (rand: () => number, n: number) => Math.min(n - 1, Math.floor(rand() * n));

/**
 * Tahta, bitki, kaynak ve kanal kaydı bir sıra yukarı kayar; en alta boşluğu `hole` sütununda olan atak kaynaklı gri
 * satır gelir (bitkisiz). En üst sırada dolu hücre varsa kaydırma yapılmaz (taşma): false.
 */
export function pushGarbageRow(
  board: Uint8Array,
  plant: Uint8Array,
  origin: Uint8Array,
  channelAt: Int8Array,
  hole: number,
): boolean {
  for (let x = 0; x < COLS; x++) if (board[x]) return false;
  board.copyWithin(0, COLS);
  plant.copyWithin(0, COLS);
  origin.copyWithin(0, COLS);
  channelAt.copyWithin(0, 1);
  const base = (ROWS - 1) * COLS;
  for (let x = 0; x < COLS; x++) {
    board[base + x] = x === hole ? 0 : PIECE.GARBAGE;
    plant[base + x] = 0;
    origin[base + x] = x === hole ? ORIGIN.none : ORIGIN.attack;
  }
  channelAt[ROWS - 1] = hole;
  return true;
}

/**
 * En alt `zone` sıranın boş hücrelerine en çok `n` atak grisi. Atlanan hücreler: dolu hücre, hava kanalı (channelAt),
 * `blocked` (düşen parça) ve sırayı tam dolduracak hücre. Aday listesi sonludur (sonsuz arama yok); uygun hücre azsa
 * daha az eklenir. Eklenen hücre indeksleri döner.
 */
export function scatterGray(
  board: Uint8Array,
  origin: Uint8Array,
  channelAt: Int8Array,
  rand: () => number,
  n: number,
  zone: number,
  blocked: ReadonlySet<number> = new Set(),
): number[] {
  const cand: number[] = [];
  for (let y = Math.max(0, ROWS - zone); y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const k = y * COLS + x;
      if (!board[k] && channelAt[y] !== x && !blocked.has(k)) cand.push(k);
    }
  const filled = new Int8Array(ROWS);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (board[y * COLS + x]) filled[y]++;
  const out: number[] = [];
  while (out.length < n && cand.length) {
    const i = pick(rand, cand.length);
    const k = cand[i] ?? 0;
    cand[i] = cand[cand.length - 1] ?? 0;
    cand.pop();
    const y = (k / COLS) | 0;
    if (filled[y] + 1 >= COLS) continue; // tam satır oluşmasın
    board[k] = PIECE.GARBAGE;
    origin[k] = ORIGIN.attack;
    filled[y]++;
    out.push(k);
  }
  return out;
}

/**
 * Spray hedefleri: `from` sırasından aşağıdaki atak grileri arasından rastgele en çok `n` benzersiz hücre (oda grisi
 * ve renkli hücre hiç seçilmez). Küçükten büyüğe sıralı döner.
 */
export function pickAttackCells(
  board: Uint8Array,
  origin: Uint8Array,
  rand: () => number,
  n: number,
  from: number,
): number[] {
  const cand: number[] = [];
  for (let k = from * COLS; k < board.length; k++) if (isAttackGray(board, origin, k)) cand.push(k);
  const out: number[] = [];
  while (out.length < n && cand.length) {
    const i = pick(rand, cand.length);
    out.push(cand[i] ?? 0);
    cand[i] = cand[cand.length - 1] ?? 0;
    cand.pop();
  }
  return out.sort((a, b) => a - b);
}

/** `from` sırasından aşağıda atak kaynaklı gri var mı (Spray hedefi). */
export function hasAttackGray(board: Uint8Array, origin: Uint8Array, from: number): boolean {
  for (let k = from * COLS; k < board.length; k++) if (isAttackGray(board, origin, k)) return true;
  return false;
}

/** `rows` sıralarından atak grisi içerenler (atak satırı: puan, satır, seviye, kombo, B2B üretmez). */
export function attackRows(board: Uint8Array, origin: Uint8Array, rows: readonly number[]): number[] {
  return rows.filter((y) => {
    for (let x = 0; x < COLS; x++) if (isAttackGray(board, origin, y * COLS + x)) return true;
    return false;
  });
}

export interface CarryResult {
  /** Yerleşen hücreler (yeni dizinler; giriş sırasıyla). */
  readonly placed: number[];
  /** Eski koordinatı korunamayıp başka hücreye taşınan. */
  readonly relocated: number;
  /** Alt bölgede yer bulunamayıp üst sıralara (gizli sıralar dahil) yerleşen: taşma baskısı. */
  readonly overflow: number;
  /** Hiç güvenli hücre bulunamayan (çağıran top-out uygular). */
  readonly lost: number;
}

/**
 * Oda geçişi: önceki odanın atak grileri (`cells`, eski dizinler) yeni odanın tahtasına yerleşir. Rastgelelik yok
 * (tam deterministik). Uygun hücre: boş, hava kanalı değil (channelAt; oda sıralarının üstünde en üst kanalın sütunu
 * da boş kalır, kanala üstten erişim kapanmaz) ve sırayı tam doldurmuyor.
 *   1. Eski koordinat uygunsa aynı yerde kalır (önce bütün hücreler için denenir).
 *   2. Değilse görünür tahtanın alt `zone` sırasındaki en yakın uygun hücre (Manhattan; eşitlikte alttaki, sonra soldaki).
 *   3. O da yoksa tahtanın geri kalanındaki en yakın uygun hücre (üstten taşma baskısı; gizli sıralar dahil).
 *   4. Hiç yoksa hücre yerleşmez ve `lost` sayılır (çağıran mevcut top-out kuralını uygular; sessiz silme yok).
 * Yerleşen hücre: board gri, origin attack, plant 0.
 */
export function carryAttackCells(
  board: Uint8Array,
  plant: Uint8Array,
  origin: Uint8Array,
  channelAt: Int8Array,
  cells: readonly number[],
  zone: number,
): CarryResult {
  const filled = new Int8Array(ROWS);
  for (let k = 0; k < board.length; k++) if (board[k]) filled[(k / COLS) | 0]++;
  // en üst kanallı sıra ve sütunu: üstündeki sıralarda bu sütun kanalın devamıdır (yerleşim yok)
  let topY = 0;
  while (topY < ROWS && (channelAt[topY] ?? -1) < 0) topY++;
  const topCh = topY < ROWS ? (channelAt[topY] ?? -1) : -1;
  const ok = (k: number) => {
    const y = (k / COLS) | 0,
      x = k % COLS;
    const ch = y < topY ? topCh : (channelAt[y] ?? -1);
    return !board[k] && ch !== x && (filled[y] ?? 0) + 1 < COLS;
  };
  const placed: number[] = [];
  const put = (k: number) => {
    board[k] = PIECE.GARBAGE;
    plant[k] = 0;
    origin[k] = ORIGIN.attack;
    filled[(k / COLS) | 0]++;
    placed.push(k);
  };
  const nearest = (k: number, y0: number, y1: number) => {
    const ky = (k / COLS) | 0,
      kx = k % COLS;
    let best = -1,
      bd = Infinity;
    for (let y = y1 - 1; y >= y0; y--)
      for (let x = 0; x < COLS; x++) {
        const c = y * COLS + x;
        if (!ok(c)) continue;
        const d = Math.abs(y - ky) + Math.abs(x - kx);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
    return best;
  };
  const rest: number[] = [];
  for (const k of cells)
    if (ok(k)) put(k);
    else rest.push(k);
  const bottom = Math.max(0, ROWS - zone);
  let relocated = 0,
    overflow = 0,
    lost = 0;
  for (const k of rest) {
    let c = nearest(k, bottom, ROWS);
    if (c < 0) {
      c = nearest(k, 0, bottom);
      if (c >= 0) overflow++;
    }
    if (c < 0) lost++;
    else {
      put(c);
      relocated++;
    }
  }
  return { placed, relocated, overflow, lost };
}

/** Satırlardaki renkli (1-7) hücre sayısı: Spray şarjına katkı (yalnızca normal satırlar sayılır). */
export function coloredInRows(board: Uint8Array, rows: readonly number[]): number {
  let n = 0;
  for (const y of rows)
    for (let x = 0; x < COLS; x++) {
      const v = board[y * COLS + x] ?? 0;
      if (v >= 1 && v <= 7) n++;
    }
  return n;
}
