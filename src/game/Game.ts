/* =====================================================================
   GAME (saf mantık, render'dan bağımsız)
   NS4-03: main.ts'ten taşındı. Bu sınıf DOM, PixiJS, localStorage, ses,
   titreşim, analitik ve CTA bilmez; dış dünyayla yalnızca on()/emit()
   olaylarıyla konuşur. Kurallar, süreler ve skor tabloları değişmedi.
   NS4-24: sentetik açıcı, rebound (hızlanma) ve alttan çöp kaldırıldı;
   yerine yeniden dolan Hapşırık: yığının en üstteki sıralarını savurur.
   NS4-27: Sinüs Odaları (reset({ rooms: true })): her oda alttan delikli gri
   bulutçuklarla başlar; hepsi temizlenince oda açılır, sonra Serbest nefes.
   NS4-22: Tam Ferahlık: satır temizlemesi tahtayı tamamen boşaltırsa bonus.
   NS4-30: oda boşlukları hava kanalları hâlinde hizalanır; açıklık oranı.
   ===================================================================== */
import { COLS, ROWS, HIDDEN, VIS, CFG, ROOMS } from '../config/gameConfig';
import { PIECE, SHAPES, KICK_JLSTZ, KICK_I, kickKey, nextRotation } from './pieces';
import { LINK, PLANTS } from './plants';
import type { GameEventArgs, GameEventListener, GameEventName, PendingClear } from '../types/events';
import type {
  GameOverReason,
  GameState,
  PieceSlot,
  RotationDirection,
  RotationState,
  Step,
  TSpinKind,
  TetrominoType,
} from '../types/game';

export class Game {
  private readonly handlers: { [K in GameEventName]?: GameEventListener<K>[] };
  /** Hücre değerleri: CellValue (0 boş, 1-7 tetromino, 8 çöp). */
  readonly board: Uint8Array;
  /** NS4-34: hücrenin bitki baytı (sap bağlantıları + rol, bkz. plants.ts); tahtayla aynı dizinler. */
  readonly plant: Uint8Array;
  // reset() içinde atanan alanlar (reset() constructor'dan çağrılır)
  state!: GameState;
  type!: PieceSlot;
  rot!: RotationState;
  x!: number;
  y!: number;
  bag!: TetrominoType[];
  queue!: TetrominoType[];
  hold!: PieceSlot;
  canHold!: boolean;
  score!: number;
  lines!: number;
  level!: number;
  combo!: number;
  b2b!: boolean;
  maxCombo!: number;
  tetrises!: number;
  tspins!: number;
  stateT!: number;
  pending!: PendingClear | null;
  gAcc!: number;
  lockT!: number;
  lockResets!: number;
  lowestY!: number;
  softDrop!: boolean;
  lastRot!: boolean;
  lastKick!: number;
  cycUsed!: boolean;
  /** NS4-24: bu oyundaki hapşırık sayısı ve son hapşırıktan beri kilitlenen parça (CFG.sneezePieces'te dolu). */
  sneezeUses!: number;
  sneezePieces!: number;
  multT!: number;
  /** NS4-27: oda akışı açık mı, mevcut oda (ROOMS.length = Serbest nefes), kalan gri bulutçuk, açılan oda sayısı. */
  rooms!: boolean;
  room!: number;
  roomGray!: number;
  /** NS4-30: odaya girerkenki gri bulutçuk sayısı (açıklık oranının paydası). */
  roomGray0!: number;
  roomsCleared!: number;
  /** NS4-22: bu oyundaki Tam Ferahlık sayısı. */
  allClears!: number;
  elapsed!: number;
  pieceVer!: number;
  boardVer!: number;
  queueVer!: number;
  private _cv?: number;
  private _c!: number;
  constructor() {
    this.handlers = {};
    this.board = new Uint8Array(COLS * ROWS);
    this.plant = new Uint8Array(COLS * ROWS);
    this.reset();
    this.state = 'idle';
    this.type = 0;
  }
  /** Dinleyici ekler (kayıt sırası çağrı sırasıdır). Dönen fonksiyon dinleyiciyi kaldırır. */
  on<K extends GameEventName>(ev: K, fn: GameEventListener<K>): () => void {
    let list = this.handlers[ev];
    if (!list) {
      list = [];
      this.handlers[ev] = list;
    }
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }
  emit<K extends GameEventName>(ev: K, ...args: GameEventArgs<K>) {
    const h = this.handlers[ev];
    if (h) for (let i = 0; i < h.length; i++) h[i](...args);
  }

  /** Aktif parça. Yalnızca aktif parçanın olduğu yollarda çağrılır (orijinalde type=0 iken SHAPES[0] okunmuyordu). */
  private get piece(): TetrominoType {
    const t = this.type;
    if (t === 0) throw new Error('Game: aktif parça yok');
    return t;
  }

  /** Yeni oyun. `rooms`: Sinüs Odaları akışı (uygulama açar); verilmezse tahta boş başlar (testler ve eski davranış). */
  reset(opts?: { readonly rooms?: boolean }) {
    this.board.fill(0);
    this.plant.fill(0);
    this.bag = [];
    this.queue = [];
    this.fillQueue();
    this.hold = 0;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.b2b = false;
    this.maxCombo = 0;
    this.tetrises = 0;
    this.tspins = 0;
    this.state = 'play'; // play | clearing | draining | over
    this.stateT = 0;
    this.pending = null;
    this.gAcc = 0;
    this.lockT = 0;
    this.lockResets = 0;
    this.lowestY = 0;
    this.softDrop = false;
    this.lastRot = false;
    this.lastKick = 0;
    this.cycUsed = false;
    this.sneezeUses = 0;
    this.sneezePieces = CFG.sneezePieces; // ilk hapşırık hazır (yalnızca tıkanıklık eşiğini bekler)
    this.multT = 0;
    this.rooms = opts?.rooms === true;
    this.room = 0;
    this.roomGray = 0;
    this.roomGray0 = 0;
    this.roomsCleared = 0;
    this.allClears = 0;
    this.elapsed = 0;
    this.pieceVer = 0;
    this.boardVer = 0;
    this.queueVer = 0;
    if (this.rooms) this.enterRoom(0);
    this.spawn();
  }

  /** NS4-27: tahtadaki gri bulutçuk (hücre 8) sayısı. */
  grayCount() {
    let n = 0;
    for (let i = 0; i < this.board.length; i++) if (this.board[i] === PIECE.GARBAGE) n++;
    return n;
  }

  /**
   * NS4-27: odaya girer: tahta temizlenir; oda ise alttan `rows` sıra gri bulutçuk dizilir (hiçbir sıra dolu değildir).
   * NS4-30: her sırada hava kanalının boşluğu (kanallar `channels` parçada, her parça ayrı sütunda, alttan yukarı)
   * ve 0..extraHoles ek boşluk. ROOMS.length: Serbest nefes (boş tahta).
   */
  enterRoom(i: number) {
    this.room = i;
    this.board.fill(0);
    this.plant.fill(0);
    const def = ROOMS[i];
    if (def) {
      const seg = Math.ceil(def.rows / def.channels);
      let channel = -1;
      for (let k = 0; k < def.rows; k++) {
        if (k % seg === 0) {
          let c = channel;
          while (c === channel) c = (Math.random() * COLS) | 0;
          channel = c;
        }
        const y = ROWS - 1 - k,
          extra = (Math.random() * (def.extraHoles + 1)) | 0;
        for (let x = 0; x < COLS; x++) this.board[y * COLS + x] = x === channel ? 0 : PIECE.GARBAGE;
        for (let h = 0; h < extra;) {
          const x = (Math.random() * COLS) | 0;
          if (this.board[y * COLS + x]) {
            this.board[y * COLS + x] = 0;
            h++;
          }
        }
      }
    }
    this.roomGray = this.roomGray0 = this.grayCount();
    this.boardVer++;
    this.emit('roomstart', { room: i, gray: this.roomGray });
  }

  /** NS4-30: odanın açıklık oranı (0..1; temizlenen gri bulutçuk / başlangıç). Serbest nefeste ve akış kapalıyken 1. */
  roomOpenness() {
    return this.roomGray0 > 0 ? 1 - this.roomGray / this.roomGray0 : 1;
  }

  /** NS4-27: odadaki son gri bulutçuk temizlendi mi (Serbest nefeste ve oda akışı kapalıyken hep false). */
  roomCleared() {
    if (!this.rooms || this.room >= ROOMS.length) return false;
    this.roomGray = this.grayCount();
    return this.roomGray === 0;
  }

  /** NS4-27: "Sinüs açıldı" geçişi: bonus, aktif parça kuyruğun başına döner, CFG.roomClearMs sonra yeni oda. */
  beginRoomClear() {
    if (this.type) this.queue.unshift(this.type);
    this.type = 0;
    this.pieceVer++;
    this.queueVer++;
    const bonus = CFG.roomBonus * (this.room + 1) * this.level;
    this.score += bonus;
    this.roomsCleared++;
    const p = { kind: 'room', rows: [] as number[] } as const;
    this.state = 'clearing';
    this.stateT = CFG.roomClearMs;
    this.pending = p;
    this.emit('roomclear', { room: this.room, bonus });
    this.emit('clearstart', p);
  }

  fillQueue() {
    while (this.queue.length < 8) {
      if (this.bag.length === 0) {
        // 7-bag randomizer
        const b: TetrominoType[] = [1, 2, 3, 4, 5, 6, 7];
        for (let i = 6; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;
          const t = b[i];
          b[i] = b[j];
          b[j] = t;
        }
        this.bag = b;
      }
      this.queue.push(this.bag.pop()!); // NS4-02: bag boşsa üstte yeniden dolduruluyor
    }
  }

  cell(x: number, y: number) {
    return x < 0 || x >= COLS || y >= ROWS ? 9 : y < 0 ? 0 : this.board[y * COLS + x];
  }

  fits(type: TetrominoType, rot: RotationState, px: number, py: number) {
    const s = SHAPES[type][rot];
    for (let i = 0; i < 4; i++) if (this.cell(px + s[i][0], py + s[i][1])) return false;
    return true;
  }

  spawn(type?: TetrominoType) {
    if (!type) {
      type = this.queue.shift()!;
      this.fillQueue();
      this.queueVer++;
    } // NS4-02: kuyruk her zaman 8 elemanlı
    this.type = type;
    this.rot = 0;
    this.x = 3;
    this.y = 0;
    this.lastRot = false;
    this.lockT = 0;
    this.lockResets = 0;
    this.gAcc = 0;
    if (!this.fits(type, 0, this.x, this.y)) return this.gameOver('blockout');
    if (this.fits(type, 0, this.x, this.y + 1)) this.y++; // guideline: doğduğu anda bir sıra in
    this.lowestY = this.y;
    this.pieceVer++;
    this.emit('spawn');
  }

  grounded() {
    return !this.fits(this.piece, this.rot, this.x, this.y + 1);
  }

  onMoved() {
    if (this.y > this.lowestY) {
      this.lowestY = this.y;
      this.lockResets = 0;
    }
    if (this.grounded() && this.lockResets < CFG.maxLockResets) {
      this.lockT = 0;
      this.lockResets++;
    }
    this.pieceVer++;
  }

  move(dx: Step) {
    if (this.state !== 'play') return false;
    if (!this.fits(this.piece, this.rot, this.x + dx, this.y)) return false;
    this.x += dx;
    this.lastRot = false;
    this.onMoved();
    this.emit('move');
    return true;
  }

  rotate(dir: RotationDirection) {
    if (this.state !== 'play' || this.type === PIECE.O) return false;
    const from = this.rot,
      to = nextRotation(this.rot, dir);
    const kicks = (this.type === PIECE.I ? KICK_I : KICK_JLSTZ)[kickKey(from, to)];
    for (let i = 0; i < kicks.length; i++) {
      const nx = this.x + kicks[i][0],
        ny = this.y - kicks[i][1];
      if (this.fits(this.piece, to, nx, ny)) {
        this.x = nx;
        this.y = ny;
        this.rot = to;
        this.lastRot = true;
        this.lastKick = i;
        this.onMoved();
        this.emit('rotate');
        return true;
      }
    }
    return false;
  }

  softStep() {
    if (this.state !== 'play') return false;
    if (!this.fits(this.piece, this.rot, this.x, this.y + 1)) return false;
    this.y++;
    this.score += 1;
    this.lastRot = false;
    this.onMoved();
    return true;
  }

  ghostY() {
    let y = this.y;
    while (this.fits(this.piece, this.rot, this.x, y + 1)) y++;
    return y;
  }

  hardDrop() {
    if (this.state !== 'play') return;
    const gy = this.ghostY(),
      d = gy - this.y;
    if (d > 0) this.lastRot = false;
    this.y = gy;
    this.score += d * 2;
    this.pieceVer++;
    this.emit('harddrop', d);
    this.lock();
  }

  doHold() {
    if (this.state !== 'play' || !this.canHold) return false;
    const cur = this.type;
    this.canHold = false;
    if (this.hold) {
      const h = this.hold;
      this.hold = cur;
      this.spawn(h);
    } else {
      this.hold = cur;
      this.spawn();
    }
    this.queueVer++;
    this.emit('hold');
    return true;
  }

  gravityMs() {
    const l = Math.min(this.level, CFG.maxLevel) - 1;
    return Math.pow(0.8 - l * 0.007, l) * 1000;
  }

  tspinKind(): TSpinKind {
    if (this.type !== PIECE.T || !this.lastRot) return 0;
    const x = this.x,
      y = this.y;
    const c = [
      this.cell(x, y) ? 1 : 0,
      this.cell(x + 2, y) ? 1 : 0,
      this.cell(x + 2, y + 2) ? 1 : 0,
      this.cell(x, y + 2) ? 1 : 0,
    ]; // TL TR BR BL
    if (c[0] + c[1] + c[2] + c[3] < 3) return 0;
    const front = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ][this.rot];
    return (c[front[0]] && c[front[1]]) || this.lastKick === 4 ? 2 : 1; // 2 tam, 1 mini
  }

  lock() {
    const s = SHAPES[this.piece][this.rot],
      plant = PLANTS[this.piece][this.rot];
    const tspin = this.tspinKind();
    let allHidden = true;
    const cells: number[] = [];
    for (let i = 0; i < 4; i++) {
      const cx = this.x + s[i][0],
        cy = this.y + s[i][1];
      this.board[cy * COLS + cx] = this.type;
      this.plant[cy * COLS + cx] = plant[i];
      cells.push(cy * COLS + cx);
      if (cy >= HIDDEN) allHidden = false;
    }
    this.boardVer++;
    this.canHold = true;
    if (this.sneezePieces < CFG.sneezePieces) this.sneezePieces++;
    this.emit('lock', cells);
    if (allHidden) return this.gameOver('lockout');

    const full: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      let f = true;
      for (let x = 0; x < COLS; x++)
        if (!this.board[y * COLS + x]) {
          f = false;
          break;
        }
      if (f) full.push(y);
    }
    this.scoreClear(full.length, tspin);
    if (full.length && this.emptyExcept(full)) this.scoreAllClear(full.length);
    if (full.length) {
      this.state = 'clearing';
      this.stateT = CFG.lineClearMs;
      this.pending = { kind: 'lines', rows: full };
      this.type = 0;
      this.pieceVer++;
      this.emit('clearstart', { rows: full, kind: 'lines' });
    } else {
      this.spawn();
    }
  }

  scoreClear(n: number, tspin: TSpinKind) {
    const base =
      tspin === 2 ? [400, 800, 1200, 1600][n] : tspin === 1 ? [100, 200, 400, 400][n] : [0, 100, 300, 500, 800][n];
    // NS4-06: tspin !== 0 ile ifade her zaman boolean (önceden T-spin'siz temizlemede 0 üretiyordu; doğruluk değeri aynı)
    const difficult = n === 4 || (tspin !== 0 && n > 0);
    let pts = base * this.level;
    let b2b = false;
    if (n > 0) {
      if (difficult && this.b2b) {
        pts = Math.floor(pts * 1.5);
        b2b = true;
      }
      this.b2b = difficult;
      this.combo++;
      if (this.combo > 0) pts += 50 * this.combo * this.level;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    } else this.combo = -1;
    if (this.multT > 0) pts *= CFG.cycMult;
    this.score += pts;
    if (n === 4) this.tetrises++;
    if (tspin && n > 0) this.tspins++;
    if (n > 0 || tspin) this.emit('scored', { n, tspin, b2b, combo: this.combo, pts });
    if (n > 0) {
      this.lines += n;
      const lv = Math.min(CFG.maxLevel, 1 + Math.floor(this.lines / CFG.linesPerLevel));
      if (lv > this.level) {
        this.level = lv;
        this.emit('levelup', lv);
      }
    }
  }

  /** NS4-22: `rows` dışındaki bütün hücreler boş mu (temizlemeden sonra tahta tamamen boşalacak mı). */
  emptyExcept(rows: readonly number[]) {
    for (let y = 0; y < ROWS; y++) {
      if (rows.includes(y)) continue;
      for (let x = 0; x < COLS; x++) if (this.board[y * COLS + x]) return false;
    }
    return true;
  }

  /**
   * NS4-22: Tam Ferahlık bonusu (CFG.allClearBonus[n] × seviye; sıklamen ×2 uygulanmaz). Yalnızca satır temizlemesinde:
   * güçlerin (sıklamen, hapşırık) boşalttığı tahta sayılmaz. Seviye, scoreClear'ın yükselttiği yeni seviyedir.
   */
  scoreAllClear(n: number) {
    const bonus = CFG.allClearBonus[Math.min(4, n) as 1 | 2 | 3 | 4] * this.level;
    this.score += bonus;
    this.allClears++;
    this.emit('allclear', { lines: n, bonus });
  }

  removeRows(rows: readonly number[]) {
    // rows sıralı (küçükten büyüğe); alttan yukarı sıkıştır
    const rm = new Uint8Array(ROWS);
    for (let i = 0; i < rows.length; i++) rm[rows[i]] = 1;
    // NS4-34: silinen sıraya uzanan saplar kopar (kayınca yeni komşuyla yanlış bağlanmasın)
    for (let r = 0; r < ROWS; r++) {
      if (!rm[r]) continue;
      for (let x = 0; x < COLS; x++) {
        if (r > 0) this.plant[(r - 1) * COLS + x] &= ~LINK.down;
        if (r < ROWS - 1) this.plant[(r + 1) * COLS + x] &= ~LINK.up;
      }
    }
    let w = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (rm[r]) continue;
      if (w !== r) {
        this.board.copyWithin(w * COLS, r * COLS, r * COLS + COLS);
        this.plant.copyWithin(w * COLS, r * COLS, r * COLS + COLS);
      }
      w--;
    }
    for (; w >= 0; w--) {
      this.board.fill(0, w * COLS, w * COLS + COLS);
      this.plant.fill(0, w * COLS, w * COLS + COLS);
    }
    this.boardVer++;
  }

  stackHeight() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (this.board[y * COLS + x]) return ROWS - y;
    }
    return 0;
  }
  congestion() {
    if (this._cv !== this.boardVer) {
      this._cv = this.boardVer;
      this._c = Math.min(1, this.stackHeight() / VIS);
    }
    return this._c;
  }

  nonEmptyBottomRows(maxCount: number, fromRow: number) {
    const out: number[] = [];
    for (let y = ROWS - 1; y >= fromRow && out.length < maxCount; y--) {
      let any = false;
      for (let x = 0; x < COLS; x++)
        if (this.board[y * COLS + x]) {
          any = true;
          break;
        }
      if (any) out.push(y);
    }
    return out.sort((a, b) => a - b);
  }

  canCyc() {
    return this.state === 'play' && !this.cycUsed && this.congestion() >= CFG.powerThreshold;
  }
  /** Hapşırık dolu mu (0..1; tıkanıklık eşiğinden bağımsız). */
  sneezeCharge() {
    return Math.min(1, this.sneezePieces / CFG.sneezePieces);
  }
  canSneeze() {
    return this.state === 'play' && this.sneezeCharge() >= 1 && this.congestion() >= CFG.powerThreshold;
  }

  /** Yığının en üstteki `maxCount` dolu sırası (küçükten büyüğe). */
  topNonEmptyRows(maxCount: number) {
    const out: number[] = [];
    for (let y = 0; y < ROWS && out.length < maxCount; y++) {
      for (let x = 0; x < COLS; x++)
        if (this.board[y * COLS + x]) {
          out.push(y);
          break;
        }
    }
    return out;
  }

  useCyc() {
    if (!this.canCyc()) return false;
    this.cycUsed = true;
    const rows = this.nonEmptyBottomRows(10, ROWS - 10);
    this.state = 'draining';
    this.stateT = CFG.drainMs;
    this.pending = { kind: 'cyc', rows };
    this.emit('clearstart', { rows, kind: 'cyc' }); // NS4-03: powerup_use analitiği app/events.ts içinde bu olaydan gönderilir
    return true;
  }

  /** NS4-24: Hapşırık: yığının en üstteki CFG.sneezeRows sırası savrulur; şarj sıfırlanır. */
  useSneeze() {
    if (!this.canSneeze()) return false;
    this.sneezeUses++;
    this.sneezePieces = 0;
    const rows = this.topNonEmptyRows(CFG.sneezeRows);
    this.state = 'clearing';
    this.stateT = CFG.sneezeMs;
    this.pending = { kind: 'sneeze', rows };
    this.emit('clearstart', { rows, kind: 'sneeze' }); // powerup_use analitiği app/events.ts içinde bu olaydan gönderilir
    return true;
  }

  finishPending() {
    const p = this.pending!;
    this.pending = null; // NS4-02: yalnızca clearing/draining sırasında çağrılır, pending doludur
    this.state = 'play';
    if (p.kind === 'room') {
      this.enterRoom(this.room + 1);
      this.emit('clearend', p);
      this.spawn();
      return;
    }
    this.removeRows(p.rows);
    if (p.kind === 'cyc') {
      this.score += 150 * p.rows.length * this.level;
      this.multT = CFG.cycMultMs;
      this.emit('powerdone', { kind: 'cyc', n: p.rows.length });
    } else if (p.kind === 'sneeze') {
      this.score += 50 * p.rows.length * this.level;
      this.emit('powerdone', { kind: 'sneeze', n: p.rows.length });
    }
    this.emit('clearend', p);
    if (this.roomCleared()) this.beginRoomClear();
    else if (p.kind === 'lines') this.spawn();
    else this.fixActiveOverlap();
  }

  fixActiveOverlap() {
    if (!this.type) return;
    for (let k = 0; k < 4 && !this.fits(this.type, this.rot, this.x, this.y); k++) this.y--;
    if (!this.fits(this.type, this.rot, this.x, this.y)) this.gameOver('overlap');
    this.pieceVer++;
  }

  gameOver(reason: GameOverReason) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.pieceVer++;
    this.emit('gameover', reason);
  }

  update(dt: number) {
    if (this.state === 'over') return;
    this.elapsed += dt;
    if (this.multT > 0) this.multT = Math.max(0, this.multT - dt);
    if (this.state === 'clearing' || this.state === 'draining') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.finishPending();
      return;
    }
    // yerçekimi
    const interval = this.gravityMs();
    this.gAcc += this.softDrop ? dt * CFG.softDropFactor : dt;
    let guard = 0;
    while (this.gAcc >= interval && guard++ < ROWS) {
      this.gAcc -= interval;
      if (this.fits(this.piece, this.rot, this.x, this.y + 1)) {
        this.y++;
        if (this.softDrop) this.score += 1;
        this.lastRot = false;
        if (this.y > this.lowestY) {
          this.lowestY = this.y;
          this.lockResets = 0;
        }
        this.pieceVer++;
      } else {
        this.gAcc = 0;
        break;
      }
    }
    if (guard >= ROWS) this.gAcc = 0;
    // kilit gecikmesi
    if (this.grounded()) {
      this.lockT += dt;
      if (this.lockT >= CFG.lockDelay || (this.lockResets >= CFG.maxLockResets && this.lockT >= CFG.lockDelay * 0.2))
        this.lock();
    } else this.lockT = 0;
  }
}
