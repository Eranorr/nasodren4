// NS4-18: ortak doğrulama kuralları (istemci + Edge Function aynı modülü kullanır).
import { describe, expect, it } from 'vitest';
import { CFG, ROOMS } from '../../src/config/gameConfig';
import {
  GAME_RULES,
  NICKNAME_MAX,
  NICKNAME_MIN,
  SCORE_LIMITS,
  expectedLevel,
  maxPlausibleScore,
  minDurationForLines,
  normalizeNickname,
  validateNickname,
  validateScorePayload,
} from '../../supabase/functions/_shared/scoreRules.ts';

const valid = () => ({
  gameId: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
  nickname: 'Nefes Ustası',
  score: 4321,
  lines: 23,
  level: 3,
  durationSeconds: 245,
  clientVersion: 'web-ns4-18',
});

describe('kurallar oyun sabitleriyle tutarlı', () => {
  it('seviye, satır/seviye ve temizleme süresi CFG ile aynı', () => {
    expect(GAME_RULES.maxLevel).toBe(CFG.maxLevel);
    expect(GAME_RULES.linesPerLevel).toBe(CFG.linesPerLevel);
    expect(GAME_RULES.lineClearSeconds * 1000).toBe(CFG.lineClearMs);
    expect(GAME_RULES.cycMult).toBe(CFG.cycMult);
    // NS4-27: oda bonusu ve oda sayısı oyunla aynı
    expect(GAME_RULES.roomBonus).toBe(CFG.roomBonus);
    expect(GAME_RULES.rooms).toBe(ROOMS.length);
    // NS4-22: Tam Ferahlık bonusu oyunla aynı
    expect(GAME_RULES.allClearBonus).toEqual(CFG.allClearBonus);
  });
  it('seviye satırdan belirlenir (Game.scoreClear ile aynı formül)', () => {
    expect([0, 9, 10, 23, 99, 190, 191, 5000].map(expectedLevel)).toEqual([1, 1, 2, 3, 10, 20, 20, 20]);
  });
});

describe('takma ad', () => {
  it('boşluklar temizlenir (baş/son, iç tekrar)', () => {
    expect(normalizeNickname('  Ferah   Nefes  ')).toBe('Ferah Nefes');
    expect(validateNickname('  Ferah   Nefes  ')).toEqual({ ok: true, value: 'Ferah Nefes' });
  });
  it.each(['Ali', 'Şükrü_42', 'göz-yaşı', 'a.b.c', 'İĞÜŞÖÇ', '1234567890123456'])('kabul: %s', (n) => {
    expect(validateNickname(n).ok).toBe(true);
  });
  it.each([
    ['ab', 'short'],
    ['  a  ', 'short'],
    ['x'.repeat(NICKNAME_MAX + 1), 'long'],
    ['<script>', 'chars'],
    ['a&b c', 'chars'],
    ['"quote"', 'chars'],
    ["o'neil", 'chars'],
    ['tab\there', 'chars'],
    ['new\nline', 'chars'],
    ['bell\u0007x', 'chars'],
    ['zero​width', 'chars'],
    ['bidi‮abc', 'chars'],
    ['joiner‍x', 'chars'],
    ['zalgơ̵̡', 'chars'],
    ['emoji😀x', 'chars'],
    ['-dash', 'chars'],
    ['dot.', 'chars'],
    ['private', 'chars'],
  ])('red: %j → %s', (n, err) => {
    expect(validateNickname(n)).toEqual({ ok: false, error: err });
  });
  it('tür kontrolü ve sınırlar', () => {
    expect(validateNickname(42)).toEqual({ ok: false, error: 'type' });
    expect(validateNickname(null)).toEqual({ ok: false, error: 'type' });
    expect(NICKNAME_MIN).toBe(3);
    expect(NICKNAME_MAX).toBe(16);
    // uzunluk kod noktasıyla: 16 Türkçe harf geçerli
    expect(validateNickname('ğ'.repeat(16)).ok).toBe(true);
  });
});

describe('skor gövdesi doğrulama', () => {
  it('geçerli gövde normalize edilmiş takma adla döner', () => {
    expect(validateScorePayload({ ...valid(), nickname: '  Nefes   Ustası ' })).toEqual({
      ok: true,
      value: { ...valid(), nickname: 'Nefes Ustası' },
    });
  });
  it.each([
    ['dizi', [], 'body'],
    ['null', null, 'body'],
    ['eksik alan', (({ lines: _l, ...rest }) => rest)(valid()), 'fields'],
    ['fazla alan', { ...valid(), ip: '1.2.3.4' }, 'fields'],
    ['gameId biçimi', { ...valid(), gameId: 'abc' }, 'gameId'],
    ['takma ad', { ...valid(), nickname: '<b>x</b>' }, 'nickname'],
    ['negatif skor', { ...valid(), score: -1 }, 'score'],
    ['ondalık skor', { ...valid(), score: 1.5 }, 'score'],
    ['NaN', { ...valid(), score: Number.NaN }, 'score'],
    ['Infinity', { ...valid(), score: Number.POSITIVE_INFINITY }, 'score'],
    ['metin skor', { ...valid(), score: '100' }, 'score'],
    ['dev skor', { ...valid(), score: SCORE_LIMITS.maxScore + 1 }, 'score'],
    ['negatif satır', { ...valid(), lines: -3 }, 'lines'],
    ['seviye 0', { ...valid(), level: 0 }, 'level'],
    ['seviye 21', { ...valid(), level: 21 }, 'level'],
    ['süre 0', { ...valid(), durationSeconds: 0 }, 'durationSeconds'],
    ['süre 7 sa', { ...valid(), durationSeconds: 7 * 3600 }, 'durationSeconds'],
    ['sürüm', { ...valid(), clientVersion: 'x'.repeat(40) }, 'clientVersion'],
    ['seviye satırla tutarsız', { ...valid(), level: 5 }, 'implausible'],
    ['satır için çok kısa süre', { ...valid(), lines: 200, level: 20, durationSeconds: 5 }, 'implausible'],
    ['süreye göre imkânsız skor', { ...valid(), lines: 0, level: 1, durationSeconds: 1, score: 50000 }, 'implausible'],
  ])('red: %s', (_n, body, err) => {
    expect(validateScorePayload(body)).toEqual({ ok: false, error: err });
  });
  it('makullük sınırı gerçek oyun referanslarını rahatça kapsar (+138, +1732, +3800 ve kombo)', () => {
    // 10 satır sonrası seviye 2, birkaç dakikalık oyun: referans skorların çok üstünde sınır
    expect(maxPlausibleScore(10, 2, 60)).toBeGreaterThan(138 + 1732 + 3800 + 538 + 638 + 738);
    expect(minDurationForLines(4)).toBeCloseTo(0.3);
    expect(minDurationForLines(5)).toBeCloseTo(0.6);
    expect(maxPlausibleScore(5000, 20, 21600)).toBe(SCORE_LIMITS.maxScore);
  });
  it('NS4-27: hızlı geçilen dört oda (az satır, kısa süre) sınırın içinde kalır', () => {
    // 4 oda × en az 1 satır, seviye 1, 60 sn: yalnızca oda bonusu 1000 × (1+2+3+4) = 10 000
    expect(maxPlausibleScore(4, 1, 60)).toBeGreaterThan(10_000 + 4 * 800);
  });
  it('NS4-22: en kötü Tam Ferahlık (her satır T-spin tekli × art arda × ×2 + tekli bonus) sınırın içinde', () => {
    const lines = 20,
      level = expectedLevel(lines),
      dur = Math.ceil(minDurationForLines(lines));
    const perLine = 800 * 1.5 * CFG.cycMult + CFG.allClearBonus[1];
    expect(maxPlausibleScore(lines, level, dur)).toBeGreaterThan(lines * perLine * level);
  });
});
