// Sıklamen çekirdeği kalıcı kural seti: prototip anahtarı, varyantlar ve skor kapatma katmanı kaldırıldı; geliştirme
// araçları (__fn.*) yalnızca import.meta.env.DEV dalında dinamik olarak yüklenir (production paketine girmez).
import { describe, expect, it } from 'vitest';
import bootstrapSrc from '../../src/app/bootstrap.ts?raw';

const sources = import.meta.glob<string>('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

describe('prototip ve varyant kalıntısı yok', () => {
  it('URL anahtarı, varyant ayrımı ve prototipe özel skor katmanı kaynakta yok', () => {
    expect(Object.keys(sources).some((f) => f.endsWith('/app/prototype.ts'))).toBe(false);
    expect(Object.keys(sources).some((f) => f.endsWith('/dev/flowDemo.ts'))).toBe(false);
    for (const [file, src] of Object.entries(sources)) {
      expect(src, file).not.toMatch(/prototype=|cyclamen-flow&|FlowVariant|guardLeaderboard|switchFromSearch/);
      expect(src, file).not.toMatch(/\bflow\s*[:=]\s*['"]v[123]['"]|game\.flow\b|g\.flow\b/);
      expect(src, file).not.toMatch(/__fn\.prototype/);
    }
  });

  it('geliştirme araçları yalnızca DEV dalında dinamik import edilir', () => {
    const src = bootstrapSrc.replace(/\r\n/g, '\n');
    const dev = src.indexOf('if (import.meta.env.DEV) {');
    expect(dev).toBeGreaterThan(0);
    for (const m of ['coreDemo', 'collisionDemo', 'fxDemo', 'screensDemo', 'audioDemo']) {
      expect(src.slice(dev), m).toContain(`import('../dev/${m}')`);
      expect(src.slice(0, dev), m).not.toContain(m);
    }
    for (const [file, src2] of Object.entries(sources)) {
      if (file.includes('/dev/') || file.endsWith('/app/bootstrap.ts') || file.endsWith('/types/platform.ts')) continue;
      expect(src2, file).not.toMatch(/from '\.\.?\/(\.\.\/)?dev\//);
    }
  });
});
