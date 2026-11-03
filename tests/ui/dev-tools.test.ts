// Kalıcı kural seti: prototip anahtarları, varyantlar ve skor kapatma katmanları kaldırıldı (sıklamen çekirdeği V3,
// Sıklamen gücü çekirdek desteği); geliştirme araçları (__fn.*) yalnızca import.meta.env.DEV dalında dinamik olarak
// yüklenir (production paketine girmez).
import { describe, expect, it } from 'vitest';
import bootstrapSrc from '../../src/app/bootstrap.ts?raw';

const sources = import.meta.glob<string>('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

describe('prototip ve varyant kalıntısı yok', () => {
  it('URL anahtarları, varyant ayrımları ve prototipe özel skor katmanı kaynakta yok', () => {
    for (const gone of [
      '/app/prototype.ts',
      '/dev/flowDemo.ts',
      '/app/cyclamenPowerSwitch.ts',
      '/dev/cyclamenPowerDemo.ts',
    ])
      expect(
        Object.keys(sources).some((f) => f.endsWith(gone)),
        gone,
      ).toBe(false);
    for (const [file, src] of Object.entries(sources)) {
      expect(src, file).not.toMatch(/prototype=|cyclamen-flow&|FlowVariant|switchFromSearch|guardLeaderboard/);
      expect(src, file).not.toMatch(/\bflow\s*[:=]\s*['"]v[123]['"]|game\.flow\b|g\.flow\b/);
      expect(src, file).not.toMatch(/__fn\.prototype|__fn\.cyclamenPower/);
      // Sıklamen gücü: tek kalıcı davranış (legacy alt 10 sıra ve ±2/±4 varyantları kaldırıldı)
      expect(src, file).not.toMatch(/cyclamen-power|core-support|cycPower|CyclamenPower|nonEmptyBottomRows|drainMs/);
      expect(src, file).not.toMatch(/Alt satırlar temizleniyor/);
    }
  });

  it('Sinüzit Atağı ve Spray kalıcı: prototip anahtarı, denge profilleri ve maskeleri kaynakta yok', () => {
    for (const gone of ['/app/protoMode.ts', '/game/protoMechanics.ts', '/ui/protoHud.ts', '/dev/protoDemo.ts'])
      expect(
        Object.keys(sources).some((f) => f.endsWith(gone)),
        gone,
      ).toBe(false);
    for (const [file, src] of Object.entries(sources)) {
      expect(src, file).not.toMatch(
        /prototype=|sinus-attack-spray&|balance=v\d|\bBALANCE\b|ProtoMods|NO_MODS|maskToMods/,
      );
      expect(src, file).not.toMatch(/\.mods\b|\.bal\b|modsToMask|protoMask|allowMods|setTrackingEnabled/);
    }
  });

  it('geliştirme araçları yalnızca DEV dalında dinamik import edilir', () => {
    const src = bootstrapSrc.replace(/\r\n/g, '\n');
    const dev = src.indexOf('if (import.meta.env.DEV) {');
    expect(dev).toBeGreaterThan(0);
    for (const m of ['coreDemo', 'collisionDemo', 'fxDemo', 'screensDemo', 'audioDemo', 'sinusDemo']) {
      expect(src.slice(dev), m).toContain(`import('../dev/${m}')`);
      expect(src.slice(0, dev), m).not.toContain(m);
    }
    for (const [file, src2] of Object.entries(sources)) {
      if (file.includes('/dev/') || file.endsWith('/app/bootstrap.ts') || file.endsWith('/types/platform.ts')) continue;
      expect(src2, file).not.toMatch(/from '\.\.?\/(\.\.\/)?dev\//);
    }
  });
});
