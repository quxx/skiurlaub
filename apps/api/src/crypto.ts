const encoder = new TextEncoder();
export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export function randomCode(): string {
  // Rejection sampling avoids modulo bias for eight decimal digits.
  const range = 100_000_000;
  const max = Math.floor(0x100000000 / range) * range;
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (value >= max);
  return String(value % range).padStart(8, '0');
}
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
export async function hash(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function key(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function mac(secret: string, value: string) {
  return hex(
    await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(value)),
  );
}
export async function verifyMac(
  secret: string,
  value: string,
  expected: string,
) {
  const bytes = new Uint8Array(
    expected.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? [],
  );
  return crypto.subtle.verify(
    'HMAC',
    await key(secret),
    bytes,
    encoder.encode(value),
  );
}
