/* =====================================================================
   Çok oyunculu imza yardımcıları (ECDSA P-256 + SHA-256, WebCrypto).
   Tarayıcı, Deno (Edge Function) ve Node (Vitest) aynı kodu kullanır.

   Her oyuncu odaya girerken tarayıcıda bir anahtar çifti üretir; özel anahtar
   dışa aktarılamaz (extractable: false), açık anahtar (JWK x, y) katılımda
   sunucuya kaydedilir. Oda istekleri (üye listesi, nabız, ayrılma) ve oyun
   iletileri bu anahtarla imzalanır; doğrulayan taraf açık anahtarı sunucudaki
   üye listesinden alır. Böylece bir oyuncu başka birinin kimliğine bürünemez.
   ===================================================================== */

/** JWK x / y alanı: 32 bayt, base64url (dolgusuz) = 43 karakter. */
export const KEY_PART_RE = /^[A-Za-z0-9_-]{43}$/;
/** ECDSA P-256 ham imza (r || s, 64 bayt) base64url = 86 karakter. */
export const SIG_RE = /^[A-Za-z0-9_-]{86}$/;

export interface PublicKeyParts {
  readonly x: string;
  readonly y: string;
}
const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function validPublicKey(raw: unknown): raw is PublicKeyParts {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    Object.keys(r).length === 2 &&
    typeof r['x'] === 'string' &&
    typeof r['y'] === 'string' &&
    KEY_PART_RE.test(r['x']) &&
    KEY_PART_RE.test(r['y'])
  );
}

/** Açık anahtarı doğrulama anahtarına çevirir; eğri üzerinde değilse null. */
export async function importPublicKey(p: PublicKeyParts): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: p.x, y: p.y, ext: true }, ALG, false, [
      'verify',
    ]);
  } catch {
    return null;
  }
}

export async function verify(key: CryptoKey, data: string, sig: unknown): Promise<boolean> {
  if (typeof sig !== 'string' || !SIG_RE.test(sig)) return false;
  try {
    return await crypto.subtle.verify(SIGN, key, fromB64url(sig), new TextEncoder().encode(data));
  } catch {
    return false;
  }
}

/** Yeni anahtar çifti: özel anahtar dışa aktarılamaz; açık anahtar x / y olarak döner. */
export async function generateIdentity(): Promise<{ readonly privateKey: CryptoKey; readonly pub: PublicKeyParts }> {
  const pair = await crypto.subtle.generateKey(ALG, false, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { privateKey: pair.privateKey, pub: { x: String(jwk.x), y: String(jwk.y) } };
}

export async function sign(privateKey: CryptoKey, data: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign(SIGN, privateKey, new TextEncoder().encode(data))));
}

/** Oda isteği imza metni (üye listesi, nabız, ayrılma). `ts`: istemci zamanı (ms; sunucu ±60 sn kabul eder). */
export function roomRequestText(action: string, roomId: string, playerId: string, ts: number): string {
  return `tetris-room|${action}|${roomId}|${playerId}|${ts}`;
}
