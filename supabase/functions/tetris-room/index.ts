/* =====================================================================
   tetris-room Edge Function giriş noktası (Deno / Supabase): çok oyunculu
   oda üyeliği. Veritabanına yalnızca service role ile ve security definer
   RPC'lerle erişir (tablolara anon / authenticated yetkisi yok).
   Secret'lar: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (otomatik),
   SCORE_HASH_PEPPER (hız sınırı anahtarı için tuz), ALLOWED_ORIGINS.
   Kurulum: docs/MULTIPLAYER.md
   ===================================================================== */
import { createDb } from '../_shared/db.ts';
import { handleRoom, type JoinResult, type Member } from './handler.ts';
import type { PublicKeyParts } from '../_shared/sign.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

const db = createDb(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

type Raw = { status: string; room_id?: string; player_id?: string; color?: number };
const toJoin = (r: Raw): JoinResult =>
  r.status === 'ok' && r.room_id && r.player_id && typeof r.color === 'number'
    ? { status: 'ok', roomId: r.room_id, playerId: r.player_id, color: r.color }
    : { status: r.status === 'full' || r.status === 'not_found' ? r.status : 'taken' };

Deno.serve((req) =>
  handleRoom(req, {
    env: (k) => Deno.env.get(k),
    limiter: db.limiter,
    createRoom: async (code, name, pub) =>
      toJoin(await db.rpc<Raw>('tetris_room_create', { p_code: code, p_name: name, p_x: pub.x, p_y: pub.y })),
    joinRoom: async (code, name, pub) =>
      toJoin(await db.rpc<Raw>('tetris_room_join', { p_code: code, p_name: name, p_x: pub.x, p_y: pub.y })),
    memberKey: (roomId, playerId) =>
      db.rpc<PublicKeyParts | null>('tetris_room_member_key', { p_room: roomId, p_player: playerId }),
    roster: (roomId, playerId) => db.rpc<Member[]>('tetris_room_roster', { p_room: roomId, p_player: playerId }),
    leave: async (roomId, playerId) => {
      await db.rpc<null>('tetris_room_leave', { p_room: roomId, p_player: playerId });
    },
  }),
);
