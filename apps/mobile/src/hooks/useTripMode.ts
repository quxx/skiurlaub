import { useEffect, useState } from 'react';

import type { TripConfig } from '@/app/trip-config';

export type TripMode = 'anticipation' | 'onTrip' | 'afterTrip';

export function resolveTripMode(
  startsAt: string,
  endsAt: string | null,
  now = Date.now(),
): TripMode {
  const start = Date.parse(startsAt);
  const end = endsAt ? Date.parse(endsAt) : null;

  if (!Number.isFinite(start) || (end !== null && !Number.isFinite(end))) {
    throw new Error('Trip configuration contains an invalid date.');
  }

  if (end !== null && end <= start)
    throw new Error('Trip end must be after start.');
  if (now < start) return 'anticipation';
  if (end !== null && now >= end) return 'afterTrip';
  return 'onTrip';
}

export function useTripMode(
  config: Pick<TripConfig, 'startsAt' | 'endsAt'>,
): TripMode {
  const [mode, setMode] = useState(() =>
    resolveTripMode(config.startsAt, config.endsAt),
  );

  useEffect(() => {
    const update = () =>
      setMode(resolveTripMode(config.startsAt, config.endsAt));
    update();
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, [config.endsAt, config.startsAt]);

  return mode;
}
