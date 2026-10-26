// NS4-07: gerçek lifecycle + gerçek oyun olayı bağlantıları (wireGameEvents) + HUD, sahte DOM üzerinde.
// Modül durumu (HUD önbelleği, bildirim zamanlayıcısı) testler arasında taşınmasın diye her çağrıda
// modüller yeniden yüklenir. Çağırmadan önce installFakeDom() ve vi.useFakeTimers() kurulmalıdır.
import { vi } from 'vitest';
import { createAppStubs } from './appStubs';
import { createGame } from './gameHelpers';

export async function loadUi(seed = 1, rooms = false) {
  vi.resetModules();
  const { createLifecycle } = await import('../../src/app/lifecycle');
  const { wireGameEvents } = await import('../../src/app/events');
  const { updateHud } = await import('../../src/ui/hud');
  const g = createGame(seed);
  const stubs = createAppStubs(g, rooms);
  const lc = createLifecycle(stubs.deps);
  wireGameEvents({ ...stubs.deps, lifecycle: lc });
  /** bootstrap'taki ana döngünün HUD adımı (menü/pause'da HUD güncellenmez). */
  const frame = () => {
    const s = lc.getState();
    if (s === 'playing' || s === 'over') updateHud(g, s === 'playing');
  };
  return { g, lc, frame, calls: stubs.calls };
}
