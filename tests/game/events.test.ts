import { describe, expect, it } from 'vitest';
import { CFG } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
import { ORIGIN, SINUS } from '../../src/game/sinusAttack';
import type { GameEventName } from '../../src/types/events';
import {
  ALL_EVENTS,
  createGame,
  dropVerticalI,
  finishClear,
  recordEvents,
  placePiece,
  setupWell,
  stackRows,
} from '../helpers/gameHelpers';

const NO_PAYLOAD: readonly GameEventName[] = ['spawn', 'move', 'rotate', 'hold', 'attackstart'];

describe('olaylar', () => {
  it('olay adları sabittir', () => {
    expect([...ALL_EVENTS].sort()).toEqual(
      [
        'allclear',
        'attack',
        'attackline',
        'attackstart',
        'clearend',
        'clearstart',
        'core',
        'cyclamen',
        'gameover',
        'harddrop',
        'hold',
        'levelup',
        'lock',
        'move',
        'powerdone',
        'roomclear',
        'roomstart',
        'rotate',
        'scored',
        'spawn',
        'spray',
        'spraystate',
      ].sort(),
    );
  });

  it('satır temizlemede olay sırası ve payloadları', () => {
    const g = createGame(1);
    setupWell(g, 1);
    g.lines = 9;
    const log = recordEvents(g);
    dropVerticalI(g);
    expect(log.names()).toEqual(['harddrop', 'lock', 'scored', 'levelup', 'clearstart']);
    expect(log.payloads('harddrop')).toEqual([18]);
    expect(log.payloads('lock')).toEqual([[189, 199, 209, 219]]);
    expect(log.payloads('scored')).toEqual([{ n: 1, tspin: 0, b2b: false, combo: 0, pts: 100 }]);
    expect(log.payloads('levelup')).toEqual([2]);
    expect(log.payloads('clearstart')).toEqual([{ rows: [21], kind: 'lines' }]);
    log.clear();
    finishClear(g);
    expect(log.names()).toEqual(['clearend', 'spawn']);
    expect(log.payloads('clearend')).toEqual([{ rows: [21], kind: 'lines' }]);
  });

  it('güçlerde powerdone, clearend olayından önce gelir', () => {
    const g = createGame(1);
    stackRows(g, 7);
    const log = recordEvents(g);
    g.useSneeze();
    expect(log.names()).toEqual(['clearstart']);
    log.clear();
    g.update(CFG.sneezeMs);
    expect(log.names()).toEqual(['powerdone', 'clearend']);
  });

  it('tam bir oturum tüm olayları üretir; payload’sız olaylar argümansız çağrılır', () => {
    const g = createGame(1);
    const log = recordEvents(g);
    g.reset({ rooms: true }); // NS4-27: oda akışı (roomstart)
    placePiece(g, PIECE.T, 0, 3, 0); // dönebilen parça (ilk parça tohuma göre O olabilir)
    g.move(1);
    g.rotate(1);
    g.doHold();
    placePiece(g, PIECE.T, 0, 3, 0); // sıklamen çekirdeği: gri bulutçukların üstüne kilitlenir ('core')
    g.core = true;
    g.hardDrop();
    setupWell(g, 4); // gri bulutçuklar silinir: bu temizlemeyle tahta boşalır (allclear) ve oda açılır
    g.lines = 9;
    dropVerticalI(g);
    finishClear(g); // satırlar → roomclear
    finishClear(g); // "Sinüs açıldı" geçişi → sonraki oda (roomstart)
    stackRows(g, 7);
    g.useSneeze();
    finishClear(g);
    stackRows(g, 7); // Sıklamen gücü: aktif çekirdek yok → en alttaki 3 gri sıra akar ('cyclamen')
    g.useCyc();
    while (g.pending) finishClear(g);
    // Sinüzit Atağı ('attackstart', 'attack'), Spray durumu ve kullanımı ('spraystate', 'spray'), atak satırı ('attackline')
    g.sinusAttack();
    g.sprayCharge = SINUS.sprayThreshold;
    g.update(16);
    g.useSpray();
    while (g.pending) finishClear(g);
    setupWell(g, 1);
    g.board[21 * 10] = PIECE.GARBAGE;
    g.origin[21 * 10] = ORIGIN.attack;
    dropVerticalI(g);
    while (g.pending) finishClear(g);
    // görünür alan dolu: gizli satırlarda kilitlenen parça → oyun sonu (lockout)
    placePiece(g, PIECE.O, 0, 3, 0);
    stackRows(g, 20);
    g.hardDrop();
    expect(g.state).toBe('over');
    expect(new Set(log.names())).toEqual(new Set(ALL_EVENTS));
    for (const e of log.all) expect(e.args).toHaveLength(NO_PAYLOAD.includes(e.name) ? 0 : 1);
  });

  it('on() kayıt sırasıyla çağırır ve dönen fonksiyon dinleyiciyi kaldırır', () => {
    const g = createGame(1);
    const calls: string[] = [];
    const offA = g.on('move', () => calls.push('a'));
    g.on('move', () => calls.push('b'));
    g.move(1);
    offA();
    offA();
    g.move(1);
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
