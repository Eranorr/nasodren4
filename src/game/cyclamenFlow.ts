/* =====================================================================
   SIKLAMEN ÇEKİRDEĞİ (kural seti cyclamen-flow-v1; bkz.
   docs/CYCLAMEN-CORE-V3-FINAL.md). Her 7'li torbada bir parçanın çiçek
   hücresi çekirdek taşır; bit, hücrenin bitki baytının boş 7. bitidir
   (plants.ts 0-6. bitleri kullanır), satırlarla birlikte kayar.
   Çekirdek kilitlenince yakınında (sütun ±FLOW.nearCols, sıra
   ±FLOW.nearRows) gri bulutçuk varsa aktifleşir ve hedef sıra en yakın
   griden sabitlenir; yoksa söner. Tahtada tek aktif çekirdek olur.
   Sonraki FLOW.coreLife parça içinde ilk standart satır temizlemesi
   (çekirdekli parçanınki dahil) onu tetikler: hedef sırada çekirdek
   sütunu ±FLOW.span içindeki griler akar (en çok 5). Ardından drenajın
   dokunduğu sütunlarda renkli hücreler griler ve taban arasında aşağı
   iner (gri sabit). Drenaj ve çökme puan, satır ya da zincir vermez.
   ===================================================================== */
import { COLS, ROWS } from '../config/gameConfig';
import { PIECE } from './pieces';
import { ALL_LINKS, LINK, ROLE, plantRole } from './plants';

/** Bitki baytında çekirdek biti (plants.ts: 0-3 bağlantı, 4-6 rol; 7 boş). */
export const CORE = 0x80;

export const FLOW = {
  /** Aktif çekirdeğin ömrü (kilitlendikten sonra yeni parça sayısı) ve drenaj süresi (ms; oyun bu sürede bekler). */
  coreLife: 7,
  rowMs: 300,
  /** Drenajdan sonra renkli hücrelerin sütunda inme süresi (ms; drenajdan sonra ayrı evre). */
  collapseMs: 180,
  /** Aktivasyon yakınlığı (çekirdek sütunu ±nearCols, sırası ±nearRows içinde gri) ve drenaj genişliği (sütun ±span). */
  nearCols: 1,
  nearRows: 2,
  span: 2,
  /** Son bu kadar parçada aktif çekirdeğin işareti hafifçe söner (görünüm). */
  coreFadeAt: 2,
  /** Drenaj puanı (0: drenaj puan vermez). */
  flushBonus: 0,
} as const;

export const hasCore = (code: number): boolean => (code & CORE) !== 0;

/** Parçanın bitki baytı; çekirdekli parçada yalnızca çiçek hücresi çekirdeği taşır. */
export const withCore = (code: number, core: boolean): number =>
  core && plantRole(code) === ROLE.head ? code | CORE : code;

/** Tahtadaki (ilk) çekirdekli hücrenin indeksi; yoksa -1. */
export function findCore(board: Uint8Array, plant: Uint8Array): number {
  for (let k = 0; k < board.length; k++) if (board[k] && plant[k] & CORE) return k;
  return -1;
}

/** Satır silindikten sonra `y` sırasının yeni yeri (altındaki silinen satır kadar aşağı kayar). */
export function shiftedRow(y: number, removed: readonly number[]): number {
  let n = 0;
  for (const r of removed) if (r > y) n++;
  return y + n;
}

/**
 * Aktivasyon: `k` hücresinin (çekirdek) çevresinde (sütun ±FLOW.nearCols, sıra ±FLOW.nearRows) gri var mı; varsa hedef
 * sıra (deterministik): en yakın gri (|dx| + |dy|), eşitlikte alttaki sıra, sonra çekirdek sütununa yakın olan. Yoksa -1.
 */
export function nearGrayRow(board: Uint8Array, k: number): number {
  const x0 = k % COLS,
    y0 = (k / COLS) | 0;
  let best = -1,
    bd = 99,
    bdx = 99;
  for (let dy = -FLOW.nearRows; dy <= FLOW.nearRows; dy++)
    for (let dx = -FLOW.nearCols; dx <= FLOW.nearCols; dx++) {
      const x = x0 + dx,
        y = y0 + dy;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS || board[y * COLS + x] !== PIECE.GARBAGE) continue;
      const d = Math.abs(dx) + Math.abs(dy),
        ax = Math.abs(dx);
      if (d < bd || (d === bd && (y > best || (y === best && ax < bdx)))) {
        best = y;
        bd = d;
        bdx = ax;
      }
    }
  return best;
}

/** `row` sırasında `col` ± `span` sütunlarındaki gri hücreler (tahta sınırında kırpılır; soldan sağa). */
export function grayCellsInSpan(board: Uint8Array, row: number, col: number, span: number): number[] {
  const out: number[] = [];
  for (let x = Math.max(0, col - span); x <= Math.min(COLS - 1, col + span); x++)
    if (board[row * COLS + x] === PIECE.GARBAGE) out.push(row * COLS + x);
  return out;
}

// çökme çalışma alanı: hücre başına inilecek sıra sayısı (tek seferlik ayrılır)
const fall = new Int16Array(COLS * ROWS);

/**
 * Sütun yerçekimi (yalnızca çekirdek drenajından sonra): `cols` sütunlarında her renkli (1-7) hücre, altındaki gri (8)
 * hücreye, başka renkli hücreye ya da tabana kadar iner; sıraları korunur, griler yerinde kalır. Bitki baytı (sap,
 * rol, çekirdek) hücreyle birlikte taşınır; farklı miktarda inen (ya da yerinde kalan) komşuyla sap bağlantısı kopar.
 * `board` ve `plant` yerinde güncellenir. Dönen değer [eski, yeni] indeks çiftleri (alttan yukarı).
 */
export function collapseColumns(board: Uint8Array, plant: Uint8Array, cols: Iterable<number>): [number, number][] {
  const moves: [number, number][] = [];
  fall.fill(0);
  for (const x of cols) {
    let w = ROWS - 1; // bu bölmede inilebilecek en alt boş sıra
    for (let y = ROWS - 1; y >= 0; y--) {
      const k = y * COLS + x,
        v = board[k];
      if (v === PIECE.GARBAGE) w = y - 1;
      else if (v) {
        if (w > y) {
          fall[k] = w - y;
          moves.push([k, w * COLS + x]);
        }
        w--;
      }
    }
  }
  if (!moves.length) return moves;
  // bağlantılar (eski konumlarla): sap ancak komşu da renkli ve iki uç aynı miktarda indiyse kalır; yoksa kopar
  // (boşa uzanan yarım bağ da temizlenir: hücre o boşluğa inince yabancı komşuya bağlı görünmesin)
  const keep = (k: number, n: number) => board[n] !== 0 && board[n] !== PIECE.GARBAGE && fall[n] === fall[k];
  for (let k = 0; k < board.length; k++) {
    if (!board[k] || board[k] === PIECE.GARBAGE || !(plant[k] & ALL_LINKS)) continue;
    const x = k % COLS;
    if (plant[k] & LINK.up && (k < COLS || !keep(k, k - COLS))) plant[k] &= ~LINK.up;
    if (plant[k] & LINK.down && (k >= (ROWS - 1) * COLS || !keep(k, k + COLS))) plant[k] &= ~LINK.down;
    if (plant[k] & LINK.left && (x === 0 || !keep(k, k - 1))) plant[k] &= ~LINK.left;
    if (plant[k] & LINK.right && (x === COLS - 1 || !keep(k, k + 1))) plant[k] &= ~LINK.right;
  }
  // taşı (alttan yukarı: hedef ya boş ya da zaten taşınmış)
  for (const [from, to] of moves) {
    board[to] = board[from];
    plant[to] = plant[from];
    board[from] = 0;
    plant[from] = 0;
  }
  return moves;
}
