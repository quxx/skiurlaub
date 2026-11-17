import { useEffect, useState } from 'react';

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMilliseconds: number;
  isComplete: boolean;
};

const secondInMilliseconds = 1_000;
const minuteInMilliseconds = 60 * secondInMilliseconds;
const hourInMilliseconds = 60 * minuteInMilliseconds;
const dayInMilliseconds = 24 * hourInMilliseconds;

export function calculateCountdown(
  targetIso: string,
  now = Date.now(),
): CountdownParts {
  const target = Date.parse(targetIso);

  if (!Number.isFinite(target)) {
    throw new Error(`Invalid countdown target: ${targetIso}`);
  }

  const totalMilliseconds = Math.max(0, target - now);

  return {
    days: Math.floor(totalMilliseconds / dayInMilliseconds),
    hours: Math.floor(
      (totalMilliseconds % dayInMilliseconds) / hourInMilliseconds,
    ),
    minutes: Math.floor(
      (totalMilliseconds % hourInMilliseconds) / minuteInMilliseconds,
    ),
    seconds: Math.floor(
      (totalMilliseconds % minuteInMilliseconds) / secondInMilliseconds,
    ),
    totalMilliseconds,
    isComplete: totalMilliseconds === 0,
  };
}

export function useCountdown(targetIso: string): CountdownParts {
  const [countdown, setCountdown] = useState(() =>
    calculateCountdown(targetIso),
  );

  useEffect(() => {
    setCountdown(calculateCountdown(targetIso));

    const interval = window.setInterval(() => {
      const next = calculateCountdown(targetIso);
      setCountdown(next);

      if (next.isComplete) window.clearInterval(interval);
    }, secondInMilliseconds);

    return () => window.clearInterval(interval);
  }, [targetIso]);

  return countdown;
}
