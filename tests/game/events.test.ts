import { describe, expect, it } from 'vitest';
import { CFG } from '../../src/config/gameConfig';
import { PIECE } from '../../src/game/pieces';
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

const NO_PAYLOAD: readonly GameEventName[] = ['spawn', 'move', 'rotate', 'hold'];

describe('olaylar', () => {
  it('olay adları sabittir', () => {
    expect([...ALL_EVENTS].sort()).toEqual(
      [
        'clearend',
        'clearstart',
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
    g.move(1);
    g.rotate(1);
    g.doHold();
    setupWell(g, 1); // gri bulutçuklar silinir: bu temizlemeyle oda açılır
    g.lines = 9;
    dropVerticalI(g);
    finishClear(g); // satırlar → roomclear
    finishClear(g); // "Sinüs açıldı" geçişi → sonraki oda (roomstart)
    stackRows(g, 7);
    g.useSneeze();
    finishClear(g);
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
