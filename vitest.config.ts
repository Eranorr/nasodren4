import { defineConfig } from 'vitest/config';

// NS4-05: oyun motoru regresyon testleri. Motor (src/game) DOM bilmediği için
// testler Node ortamında, jsdom olmadan koşar. vite.config.ts'ten bağımsızdır;
// build ayarlarını etkilemez.
// NS4-06: UI modülleri (hud, screens, InputController, lifecycle) tests/helpers/fakeDom.ts ile test edilir.
export default defineConfig({
  // .env.local / .env.production okunmaz: testler gerçek Supabase projesine bağlanmaz (global skor ve çok oyunculu kapalı)
  envDir: 'tests/env',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // vi.spyOn ile kurulan Math.random taklitleri her testten sonra özgün hâline döner.
    restoreMocks: true,
    // Sahte DOM globalleri (vi.stubGlobal) her testten sonra kaldırılır.
    unstubGlobals: true,
    // CSS sözleşme testi src/styles.css'i ?raw ile metin olarak okur; Vitest CSS'i varsayılan olarak boşaltır.
    css: { include: [/src\/styles\.css/] },
  },
});
