// Decodes a PostGIS point as Supabase/PostgREST returns it: hex-encoded
// (E)WKB, e.g. "0101000020E6100000<x:8 bytes><y:8 bytes>". Returns null for
// anything that isn't a valid 2D point, so callers can fall back safely.
import type { LatLng } from "@/lib/types";

const WKB_POINT = 1;
const EWKB_SRID_FLAG = 0x20000000;

export function parseEwkbPoint(hex: unknown): LatLng | null {
  if (typeof hex !== "string" || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const view = new DataView(bytes.buffer);
  if (bytes.length < 21) return null;

  const littleEndian = view.getUint8(0) === 1;
  const type = view.getUint32(1, littleEndian);
  if ((type & 0xff) !== WKB_POINT) return null;

  let offset = 5;
  if (type & EWKB_SRID_FLAG) offset += 4; // skip SRID (4326)
  if (bytes.length < offset + 16) return null;

  const lng = view.getFloat64(offset, littleEndian);
  const lat = view.getFloat64(offset + 8, littleEndian);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
