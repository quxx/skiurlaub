import { useEffect, useState } from 'react';
import { tripConfig } from '@/app/trip-config';
import { useWeatherData } from '@/components/weather/WeatherDataProvider';
import { useResortData } from '@/components/resort/ResortDataProvider';
import { formatSourceTime } from '@/data/date-time';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';

export function DashboardStatus() {
  const weather = useWeatherData();
  const resort = useResortData();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return (
    <details className="dashboard-status" aria-label="Datenaktualität">
      <summary className="dashboard-status__summary">
        <span>
          <RefreshCw size={18} strokeWidth={1.8} aria-hidden="true" />
          Datenstand & Aktualisierung
        </span>
        <span>
          <StatusBadge
            tone={
              !online ||
              weather.resource.error ||
              resort.resource.error ||
              weather.resource.data?.freshness === 'stale' ||
              resort.resource.data?.freshness === 'stale'
                ? 'warning'
                : 'muted'
            }
          >
            {!online
              ? 'Offline'
              : weather.resource.error || resort.resource.error
                ? 'Abruf fehlgeschlagen'
                : weather.resource.status === 'loading' ||
                    resort.resource.status === 'loading'
                  ? 'Wird geladen'
                  : weather.resource.data?.freshness === 'stale' ||
                      resort.resource.data?.freshness === 'stale'
                    ? 'Veraltet'
                    : 'Aktuell'}
          </StatusBadge>
          <ChevronDown
            className="disclosure-chevron"
            size={18}
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="dashboard-status__content">
        {!online && (
          <p role="status">
            Du bist offline. Bereits geladene Werte können veraltet sein.
          </p>
        )}
        {[
          {
            label: 'Wetter',
            value: weather,
            href: 'https://open-meteo.com/',
            credit: 'Open-Meteo · CC BY 4.0 · Modellwerte, keine Messung',
          },
          {
            label: 'Resortstatus',
            value: resort,
            href: 'https://status.live/ski/zillertal-arena',
            credit: 'status.live · nichtoffizieller Drittanbieter',
          },
        ].map(({ label, value, href, credit }) => (
          <div className="source-status" key={label}>
            <div>
              <strong>{label}</strong>
              <p>
                <a
                  className="source-credit"
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {credit}
                </a>
              </p>
              <p>
                Quellstand:{' '}
                {formatSourceTime(
                  value.resource.data?.observedAt ?? null,
                  tripConfig.timeZone,
                )}{' '}
                · {tripConfig.timeZone}
              </p>
              <p>
                Letzter erfolgreicher Abruf:{' '}
                {formatSourceTime(
                  value.resource.data?.fetchedAt ?? null,
                  tripConfig.timeZone,
                )}
              </p>
              {(value.resource.error || value.resource.data?.refreshError) && (
                <p role="status">
                  {value.resource.error?.message ??
                    value.resource.data?.refreshError}{' '}
                  {value.resource.data?.data &&
                    'Gespeicherte Werte werden als veraltet angezeigt.'}
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              static
              disabled={!value.canReload || !online}
              onClick={value.reload}
              title="Mindestens eine Minute zwischen Aktualisierungen"
            >
              {label} aktualisieren
            </Button>
          </div>
        ))}
        <small>
          Automatisch: Wetter alle 30 Minuten, Resortstatus alle 15 Minuten.
          Manuell frühestens nach einer Minute. Nach Reiseende stoppt die
          automatische Aktualisierung.
        </small>
      </div>
    </details>
  );
}
