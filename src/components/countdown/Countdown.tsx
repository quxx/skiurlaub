import { tripConfig } from '@/app/trip-config';
import { useCountdown } from '@/hooks/useCountdown';

const units = [
  { key: 'days', label: 'Tage' },
  { key: 'hours', label: 'Stunden' },
  { key: 'minutes', label: 'Minuten' },
  { key: 'seconds', label: 'Sekunden' },
] as const;

export function Countdown() {
  const countdown = useCountdown(tripConfig.startsAt);

  return (
    <div
      className="my-8 grid grid-cols-4 gap-2 sm:gap-4"
      aria-label={`${countdown.days} Tage, ${countdown.hours} Stunden, ${countdown.minutes} Minuten und ${countdown.seconds} Sekunden bis zum Reisebeginn`}
      role="timer"
    >
      {units.map(({ key, label }) => {
        const value = countdown[key];
        return (
          <div
            className="rounded-2xl border border-white/8 bg-white/4 px-2 py-5 text-center"
            key={key}
          >
            <strong
              className="countdown-number block text-3xl font-semibold tracking-[-0.06em] tabular-nums sm:text-5xl"
              key={`${key}-${value}`}
            >
              {String(value).padStart(2, '0')}
            </strong>
            <span className="mt-2 block text-[0.55rem] tracking-[0.12em] text-ice-200/50 uppercase">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
