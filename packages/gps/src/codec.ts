import type { RawPoint } from './types';

// Compact, versioned binary track format (v1): delta + varint encoding, then gzip.
// 1 point is roughly 8-12 bytes before gzip; one 8 h day at 10 s is about 30-60 KB.
export const TRACK_FORMAT_VERSION = 1;
export const MAX_TRACK_POINTS = 200_000;
export const MAX_DECOMPRESSED_BYTES = 4_000_000;
const MAGIC = [0x53, 0x4b, 0x47, 0x54]; // "SKGT"

export class TrackCodecError extends Error {}

const FLAG_ALT = 1;
const FLAG_ACC = 2;
const FLAG_VACC = 4;
const FLAG_SPEED = 8;
const FLAG_PRESSURE = 16;
const FLAG_ALTE = 32;

function writeVarint(out: number[], value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TrackCodecError('Wert nicht kodierbar.');
  while (value >= 128) {
    out.push((value % 128) | 128);
    value = Math.floor(value / 128);
  }
  out.push(value);
}
const zigzag = (n: number) => (n >= 0 ? n * 2 : -n * 2 - 1);
const unzigzag = (z: number) => (z % 2 === 0 ? z / 2 : -(z + 1) / 2);

class Reader {
  private index = 0;
  constructor(private readonly bytes: Uint8Array) {}
  byte(): number {
    if (this.index >= this.bytes.length)
      throw new TrackCodecError('Unerwartetes Ende der Daten.');
    return this.bytes[this.index++];
  }
  varint(): number {
    let result = 0;
    let multiplier = 1;
    for (let i = 0; i < 9; i++) {
      const b = this.byte();
      result += (b & 127) * multiplier;
      if (!(b & 128)) return result;
      multiplier *= 128;
    }
    throw new TrackCodecError('Ungültiger Zahlenwert.');
  }
  signed(): number {
    return unzigzag(this.varint());
  }
}

const q = (value: number, scale: number) => Math.round(value * scale);

export function encodeTrack(points: readonly RawPoint[]): Uint8Array {
  if (points.length > MAX_TRACK_POINTS)
    throw new TrackCodecError('Zu viele Punkte.');
  const out: number[] = [...MAGIC, TRACK_FORMAT_VERSION];
  writeVarint(out, points.length);
  let t = 0;
  let lat = 0;
  let lon = 0;
  let alt = 0;
  let altE = 0;
  let pressure = 0;
  points.forEach((p, i) => {
    let flags = 0;
    if (p.alt != null) flags |= FLAG_ALT;
    if (p.acc != null) flags |= FLAG_ACC;
    if (p.vacc != null) flags |= FLAG_VACC;
    if (p.speed != null) flags |= FLAG_SPEED;
    if (p.pressureHpa != null) flags |= FLAG_PRESSURE;
    if (p.altE != null) flags |= FLAG_ALTE;
    out.push(flags);
    if (i === 0) writeVarint(out, Math.round(p.t));
    else writeVarint(out, zigzag(Math.round(p.t) - t));
    t = Math.round(p.t);
    const la = q(p.lat, 1e6);
    const lo = q(p.lon, 1e6);
    writeVarint(out, zigzag(la - lat));
    writeVarint(out, zigzag(lo - lon));
    lat = la;
    lon = lo;
    if (flags & FLAG_ALT) {
      const a = q(p.alt as number, 10);
      writeVarint(out, zigzag(a - alt));
      alt = a;
    }
    if (flags & FLAG_ACC) writeVarint(out, q(Math.max(0, p.acc as number), 10));
    if (flags & FLAG_VACC)
      writeVarint(out, q(Math.max(0, p.vacc as number), 10));
    if (flags & FLAG_SPEED)
      writeVarint(out, q(Math.max(0, p.speed as number), 100));
    if (flags & FLAG_PRESSURE) {
      const pa = q(p.pressureHpa as number, 100);
      writeVarint(out, zigzag(pa - pressure));
      pressure = pa;
    }
    if (flags & FLAG_ALTE) {
      const a = q(p.altE as number, 10);
      writeVarint(out, zigzag(a - altE));
      altE = a;
    }
  });
  return Uint8Array.from(out);
}

export function decodeTrack(bytes: Uint8Array): RawPoint[] {
  const reader = new Reader(bytes);
  for (const expected of MAGIC)
    if (reader.byte() !== expected)
      throw new TrackCodecError('Kein gültiges Track-Format.');
  if (reader.byte() !== TRACK_FORMAT_VERSION)
    throw new TrackCodecError('Nicht unterstützte Track-Version.');
  const count = reader.varint();
  if (count > MAX_TRACK_POINTS) throw new TrackCodecError('Zu viele Punkte.');
  const points: RawPoint[] = [];
  let t = 0;
  let lat = 0;
  let lon = 0;
  let alt = 0;
  let altE = 0;
  let pressure = 0;
  for (let i = 0; i < count; i++) {
    const flags = reader.byte();
    t = i === 0 ? reader.varint() : t + reader.signed();
    lat += reader.signed();
    lon += reader.signed();
    const point: RawPoint = { t, lat: lat / 1e6, lon: lon / 1e6 };
    if (flags & FLAG_ALT) {
      alt += reader.signed();
      point.alt = alt / 10;
    }
    if (flags & FLAG_ACC) point.acc = reader.varint() / 10;
    if (flags & FLAG_VACC) point.vacc = reader.varint() / 10;
    if (flags & FLAG_SPEED) point.speed = reader.varint() / 100;
    if (flags & FLAG_PRESSURE) {
      pressure += reader.signed();
      point.pressureHpa = pressure / 100;
    }
    if (flags & FLAG_ALTE) {
      altE += reader.signed();
      point.altE = altE / 10;
    }
    points.push(point);
  }
  return points;
}

async function readAll(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new TrackCodecError('Daten sind zu groß.');
    }
    chunks.push(part.value);
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export async function compressTrack(
  points: readonly RawPoint[],
): Promise<Uint8Array> {
  const stream = new Blob([Uint8Array.from(encodeTrack(points)).buffer])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return readAll(stream as ReadableStream<Uint8Array>, MAX_DECOMPRESSED_BYTES);
}

// The size cap protects against decompression bombs: reading stops past maxBytes.
export async function decompressTrack(
  data: Uint8Array,
  maxBytes = MAX_DECOMPRESSED_BYTES,
): Promise<RawPoint[]> {
  try {
    const stream = new Blob([Uint8Array.from(data).buffer])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    return decodeTrack(
      await readAll(stream as ReadableStream<Uint8Array>, maxBytes),
    );
  } catch (error) {
    if (error instanceof TrackCodecError) throw error;
    throw new TrackCodecError('Daten konnten nicht entpackt werden.');
  }
}

// Base64 helpers (chunked so large tracks do not overflow the call stack).
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
