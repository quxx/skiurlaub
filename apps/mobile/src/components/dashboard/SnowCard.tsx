import { ExternalLink, Snowflake } from 'lucide-react';
import { useWeatherData } from '@/components/weather/WeatherDataProvider';
import { modelSnowProvider, officialSnowReport } from '@/data/snow/provider';

function useSnow() {
  const { resource } = useWeatherData();
  const envelope = resource.data
    ? modelSnowProvider.fromWeather(resource.data)
    : null;
  return envelope?.data ?? null;
}

// KPI tile: model values stay labelled as "Modell"; measured values live in the
// official report (no permitted data feed yet).
export function SnowTile() {
  const snow = useSnow();
  const depth = snow ? Math.round(snow.modelDepthCentimeters) : null;
  const newSnow = snow?.forecastSnowfallCentimeters ?? null;
  return (
    <div className="kpi">
      <span className="kpi-label">
        <Snowflake size={14} aria-hidden="true" /> Schnee
      </span>
      <strong className="kpi-value" data-zero={depth === 0 || undefined}>
        {depth ?? '—'}
        <small> cm</small>
      </strong>
      <span className="kpi-sub">Modellwert</span>
      <span className="kpi-sub" data-accent={(newSnow ?? 0) > 0 || undefined}>
        Neu{' '}
        {newSnow != null
          ? `${newSnow.toLocaleString('de-DE', { maximumFractionDigits: 1 })} cm`
          : '—'}
      </span>
    </div>
  );
}

export function SnowReportLink() {
  return (
    <a
      className="resort-row action-row"
      href={officialSnowReport}
      target="_blank"
      rel="noreferrer"
    >
      <Snowflake size={24} strokeWidth={1.8} aria-hidden="true" />
      <div>
        <h3>Offizieller Schneebericht</h3>
        <p>Messwerte im offiziellen Bericht</p>
      </div>
      <ExternalLink size={20} aria-hidden="true" />
    </a>
  );
}
