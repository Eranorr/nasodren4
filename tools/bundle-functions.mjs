// Edge Function'ları Supabase panelindeki editöre yapıştırılabilir tek dosyaya paketler (CLI yoksa).
// Çıktı: supabase/.dashboard/<ad>.ts (Git'e eklenmez). Kaynak: supabase/functions/<ad>/index.ts.
// Kullanım: node tools/bundle-functions.mjs
import { build } from 'rolldown';
import { mkdirSync } from 'node:fs';

const names = ['tetris-submit-score', 'tetris-room'];
mkdirSync('supabase/.dashboard', { recursive: true });
for (const name of names) {
  await build({
    input: `supabase/functions/${name}/index.ts`,
    platform: 'neutral',
    output: {
      file: `supabase/.dashboard/${name}.ts`,
      format: 'esm',
      banner: `// ${name}: tools/bundle-functions.mjs ile üretildi; düzenlemeyin (kaynak: supabase/functions/${name}).`,
    },
  });
  console.log(`supabase/.dashboard/${name}.ts`);
}
