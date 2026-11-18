import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import type { RawPoint } from '@skiurlaub/gps';
import { batterySampleSchema } from '@/data/battery';

// Bridge to the native recorder (SkiurlaubGpsPlugin). Everything coming back over
// the bridge is validated; raw tracks never leave the device from here.
export const gpsAvailable = Capacitor.isNativePlatform();

export const gpsStatusSchema = z.object({
  state: z.enum(['idle', 'recording', 'paused']),
  trackId: z.string().nullable(),
  pointCount: z.number(),
  startedAt: z.number(),
  lastAccuracy: z.number(),
  lastFixAt: z.number(),
  intervalMs: z.number(),
  distanceM: z.number(),
  error: z.string().nullable(),
  // Debug builds only (battery acceptance test).
  batteryPct: z.number().optional(),
  batteryStartPct: z.number().optional(),
});
export type GpsStatus = z.infer<typeof gpsStatusSchema>;

export const trackMetaSchema = z.object({
  id: z.uuid(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  state: z.enum(['recording', 'paused', 'stopped', 'interrupted']),
  pointCount: z.number(),
  distanceM: z.number().optional(),
  altRef: z.enum(['msl', 'ellipsoid']).optional(),
  battery: z.array(batterySampleSchema).optional(),
});
export type TrackMeta = z.infer<typeof trackMetaSchema>;

const finite = z.number().finite();
export const rawPointSchema = z.object({
  t: finite,
  lat: finite,
  lon: finite,
  alt: finite.optional(),
  altE: finite.optional(),
  acc: finite.optional(),
  vacc: finite.optional(),
  speed: finite.optional(),
  pressureHpa: finite.optional(),
});

interface GpsPlugin {
  getPermissions(): Promise<{ location: boolean; notifications: boolean }>;
  requestTrackingPermissions(): Promise<{
    location: boolean;
    notifications: boolean;
  }>;
  getStatus(): Promise<unknown>;
  start(options: { consent: true }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  listTracks(): Promise<{ tracks: unknown[] }>;
  readTrack(options: {
    id: string;
  }): Promise<{ meta: unknown; points: unknown[] }>;
  deleteTrack(options: { id: string }): Promise<void>;
  addListener(
    event: 'status',
    handler: (status: unknown) => void,
  ): Promise<PluginListenerHandle>;
}
export const gps = registerPlugin<GpsPlugin>('SkiurlaubGps');

export async function loadStatus(): Promise<GpsStatus> {
  return gpsStatusSchema.parse(await gps.getStatus());
}

export async function loadTracks(): Promise<TrackMeta[]> {
  const { tracks } = await gps.listTracks();
  return tracks.flatMap((track) => {
    const parsed = trackMetaSchema.safeParse(track);
    return parsed.success ? [parsed.data] : [];
  });
}

// A damaged line is skipped instead of failing the whole recording.
export async function loadTrack(
  id: string,
): Promise<{ meta: TrackMeta; points: RawPoint[] }> {
  const result = await gps.readTrack({ id });
  const meta = trackMetaSchema.parse(result.meta);
  const points = result.points.flatMap((point) => {
    const parsed = rawPointSchema.safeParse(point);
    return parsed.success ? [parsed.data] : [];
  });
  return { meta, points };
}

const consentKey = 'skiurlaub:gps-consent:v1';
export function hasGpsConsent(): boolean {
  try {
    return localStorage.getItem(consentKey) === 'yes';
  } catch {
    return false;
  }
}
export function saveGpsConsent() {
  try {
    localStorage.setItem(consentKey, 'yes');
  } catch {
    // the dialog simply appears again next time
  }
}

export function useGpsStatus(): GpsStatus | null {
  const [status, setStatus] = useState<GpsStatus | null>(null);
  useEffect(() => {
    if (!gpsAvailable) return;
    let active = true;
    const apply = (value: unknown) => {
      const parsed = gpsStatusSchema.safeParse(value);
      if (active && parsed.success) setStatus(parsed.data);
    };
    const poll = () => void gps.getStatus().then(apply, () => undefined);
    poll();
    const timer = window.setInterval(poll, 2000);
    const handle = gps.addListener('status', apply);
    return () => {
      active = false;
      window.clearInterval(timer);
      void handle.then((h) => h.remove());
    };
  }, []);
  return status;
}
