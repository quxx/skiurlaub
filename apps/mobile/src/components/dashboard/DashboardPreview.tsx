import {
  CableCar,
  ChevronRight,
  CloudSnow,
  Map,
  Route,
  Wind,
} from 'lucide-react';
import { Link } from 'react-router';
import { tripConfig } from '@/app/trip-config';
import { DashboardStatus } from './DashboardStatus';
import { SnowReportLink, SnowTile } from './SnowCard';
import { formatSourceTime } from '@/data/date-time';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useResortData } from '@/components/resort/ResortDataProvider';
import { useWeatherData } from '@/components/weather/WeatherDataProvider';
import { weatherPresentation } from '@/data/weather/weather-code';
import { WeatherScene, sceneKind } from './WeatherScene';
import { useCountdown } from '@/hooks/useCountdown';
import { useTripMode } from '@/hooks/useTripMode';

const number = (value: number | null | undefined) =>
  value == null
    ? '—'
    : value.toLocaleString('de-DE', { maximumFractionDigits: 1 });

// Isolated so the per-second countdown tick re-renders only this chip.
function CountdownChip() {
  const mode = useTripMode(tripConfig);
  const countdown = useCountdown(tripConfig.startsAt);
  if (mode !== 'anticipation') return null;
  return (
    <span className="hero-chip">
      Noch {countdown.days} {countdown.days === 1 ? 'Tag' : 'Tage'}
    </span>
  );
}

function Meter({
  value,
  total,
}: {
  value: number | null;
  total: number | null;
}) {
  const ratio =
    value != null && total ? Math.min(1, Math.max(0, value / total)) : 0;
  return (
    <span className="kpi-meter" aria-hidden="true">
      <span style={{ width: `${Math.round(ratio * 100)}%` }} />
    </span>
  );
}

export function DashboardPreview() {
  const { resource: weatherResource } = useWeatherData();
  const { resource: resortResource } = useResortData();
  const weatherEnvelope = weatherResource.data;
  const weather = weatherEnvelope?.data?.current;
  const view = weather ? weatherPresentation(weather.weatherCode) : null;
  const WeatherIcon = view?.icon ?? CloudSnow;
  const resort = resortResource.data?.data;
  const weatherStale = weatherEnvelope?.freshness === 'stale';
  const resortStale = resortResource.data?.freshness === 'stale';
  const stale = weatherStale || resortStale;
  // Badges only appear when something needs attention; "all fine" stays quiet.
  const weatherBadge = weatherStale
    ? 'Veraltet'
    : !weather
      ? weatherResource.status === 'loading'
        ? 'Lädt'
        : 'Nicht verfügbar'
      : null;
  const resortBadge = resortStale
    ? 'Veraltet'
    : !resort
      ? resortResource.status === 'loading'
        ? 'Lädt'
        : 'Nicht verfügbar'
      : null;
  // One combined timestamp: the OLDER source, so we never imply fresher data.
  const times = [weatherEnvelope?.fetchedAt, resortResource.data?.observedAt]
    .filter(
      (value): value is string => !!value && Number.isFinite(Date.parse(value)),
    )
    .sort();
  const oldest = times[0] ?? null;
  const idle =
    !!resort &&
    resort.lifts.open === 0 &&
    (resort.lifts.total ?? 0) > 0 &&
    !resortStale;
  return (
    <section
      className="conditions-section shell"
      id="conditions"
      aria-label="Bedingungen am Berg"
    >
      <article
        className="current-weather hero"
        data-scene={weather ? sceneKind(weather.weatherCode) : undefined}
      >
        {weather && (
          <WeatherScene
            kind={sceneKind(weather.weatherCode)}
            isDay={weather.isDay}
          />
        )}
        <div className="hero-top">
          <span className="hero-place">
            Am Berg ·{' '}
            {tripConfig.weatherLocation.elevation.toLocaleString('de-DE')} m
          </span>
          <CountdownChip />
          {weatherBadge && (
            <StatusBadge tone={weatherStale ? 'warning' : 'muted'}>
              {weatherBadge}
            </StatusBadge>
          )}
        </div>
        <div className="weather-reading">
          <strong>
            {weather ? `${Math.round(weather.temperatureCelsius)}°` : '—'}
          </strong>
          <div>
            <WeatherIcon size={32} strokeWidth={1.5} aria-hidden="true" />
            <h2>{view?.label ?? 'Wetter nicht verfügbar'}</h2>
          </div>
        </div>
        <div className="weather-facts">
          <span>
            <Wind size={16} aria-hidden="true" />{' '}
            {weather ? `${Math.round(weather.windSpeedKmh)} km/h` : '—'} Wind
          </span>
          <span>
            Gefühlt{' '}
            {weather
              ? `${Math.round(weather.apparentTemperatureCelsius)}°`
              : '—'}
          </span>
        </div>
      </article>

      <div className="resort-section-title">
        <h2>Skigebiet</h2>
        {resortBadge && (
          <StatusBadge tone={resortStale ? 'warning' : 'muted'}>
            {resortBadge}
          </StatusBadge>
        )}
      </div>
      <div className="kpi-row" data-idle={idle || undefined}>
        <div className="kpi">
          <span className="kpi-label">
            <CableCar size={14} aria-hidden="true" /> Lifte
          </span>
          <strong className="kpi-value">
            {number(resort?.lifts.open)}
            <small> / {number(resort?.lifts.total)}</small>
          </strong>
          <Meter
            value={resort?.lifts.open ?? null}
            total={resort?.lifts.total ?? null}
          />
          <span className="kpi-sub">Zillertal Arena</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">
            <Route size={14} aria-hidden="true" /> Pisten
          </span>
          <strong className="kpi-value">
            {number(resort?.pisteKilometers.open)}
            <small> km</small>
          </strong>
          <Meter
            value={resort?.pisteCount?.open ?? null}
            total={resort?.pisteCount?.total ?? null}
          />
          <span className="kpi-sub">
            {resort?.pisteCount?.open ?? '—'} /{' '}
            {resort?.pisteCount?.total ?? '—'} offen
          </span>
        </div>
        <SnowTile />
      </div>
      {idle && (
        <p className="resort-idle" role="status">
          Derzeit ist kein Lift in Betrieb – außerhalb der Betriebszeiten oder
          vor Saisonstart.
        </p>
      )}
      <div className="resort-list">
        <Link className="resort-row action-row" to="/karte">
          <Map size={24} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <h3>Pistenkarte öffnen</h3>
            <p>Lifte, Abfahrten und Livecams</p>
          </div>
          <ChevronRight size={22} aria-hidden="true" />
        </Link>
        <SnowReportLink />
      </div>
      <p className="update-line" data-stale={stale || undefined}>
        {oldest
          ? `${stale ? 'Veraltet · Stand' : 'Aktualisiert'} ${formatSourceTime(oldest, tripConfig.timeZone, !stale)}`
          : 'Noch keine Daten geladen'}
      </p>
      <DashboardStatus />
    </section>
  );
}
