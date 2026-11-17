import { tripConfig } from '@/app/trip-config';
import { useTripMode } from '@/hooks/useTripMode';

export function TripHeader() {
  const mode = useTripMode(tripConfig);
  const start = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    timeZone: tripConfig.timeZone,
  }).format(new Date(tripConfig.startsAt));
  return (
    <div className="toolbar-trip">
      <h1>{tripConfig.destination}</h1>
      <p>
        <span>
          {mode === 'anticipation'
            ? `Ab ${start}`
            : mode === 'onTrip'
              ? 'Du bist im Skiurlaub'
              : 'Reise beendet'}
        </span>
      </p>
    </div>
  );
}
