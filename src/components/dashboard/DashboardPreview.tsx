import {
  CableCar,
  CloudSnow,
  ExternalLink,
  RefreshCw,
  Route,
  Snowflake,
  Wind,
} from "lucide-react";

import { tripConfig } from "@/app/trip-config";
import { DataCard } from "@/components/ui/DataCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useResortData } from "@/components/resort/ResortDataProvider";
import { LiftMiniMap } from "@/components/resort/LiftMiniMap";
import { useWeatherData } from "@/components/weather/WeatherDataProvider";
import { weatherPresentation } from "@/data/weather/weather-code";

const officialSnowReport =
  "https://www.zillertalarena.com/info-service/livecams-wetter/schneebericht/";

export function DashboardPreview() {
  const { resource: weatherResource, reload } = useWeatherData();
  const { resource: resortResource, reload: reloadResort } = useResortData();
  const weatherEnvelope = weatherResource.data;
  const weather = weatherEnvelope?.data?.current ?? null;
  const todayForecast = weatherEnvelope?.data?.forecast[0] ?? null;
  const weatherView = weather ? weatherPresentation(weather.weatherCode) : null;
  const WeatherIcon = weatherView?.icon ?? CloudSnow;
  const weatherLoading =
    weatherResource.status === "idle" || weatherResource.status === "loading";
  const weatherStale = weatherEnvelope?.freshness === "stale";
  const resortEnvelope = resortResource.data;
  const resort = resortEnvelope?.data ?? null;
  const resortLoading =
    resortResource.status === "idle" || resortResource.status === "loading";
  const resortStale = resortEnvelope?.freshness === "stale";
  const pistePercent =
    resort?.pisteKilometers.open !== null &&
    resort?.pisteKilometers.open !== undefined &&
    resort.pisteKilometers.total
      ? Math.round(
          (resort.pisteKilometers.open / resort.pisteKilometers.total) * 100,
        )
      : 0;
  const liftPercent =
    resort?.lifts.open !== null &&
    resort?.lifts.open !== undefined &&
    resort.lifts.total
      ? Math.round((resort.lifts.open / resort.lifts.total) * 100)
      : 0;

  return (
    <section className="section-shell bg-midnight-950" id="conditions">
      <div className="shell">
        <div className="mb-14 grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
          <div>
            <p className="eyebrow text-ice-200/55">
              <span /> Aktuelle Bedingungen
            </p>
            <h2 className="section-title">
              Dein Berg.
              <br />
              <em className="outline-heading subtle">Ein Blick.</em>
            </h2>
          </div>
        </div>

        <div className="condition-grid">
          <DataCard
            title="Wetter"
            subtitle="Hochkrimml"
            icon={WeatherIcon}
            badge={
              <WeatherBadge
                loading={weatherLoading}
                stale={weatherStale}
                available={Boolean(weather)}
              />
            }
            className="weather-data-card min-h-[22rem]"
          >
            <div className="dashboard-metric min-h-32 flex-row items-center justify-between py-4">
              <div>
                <strong
                  className={`dashboard-value ${weatherLoading && !weather ? "animate-pulse" : ""}`}
                >
                  {weather ? `${Math.round(weather.temperatureCelsius)}°` : "—"}
                </strong>
                <span className="dashboard-description block">
                  {weatherView?.label ??
                    (weatherLoading
                      ? "Wetterdaten werden geladen …"
                      : "Keine Wetterdaten verfügbar")}
                </span>
              </div>
              <WeatherIcon
                className={
                  weatherView?.isSunny
                    ? "text-amber-300"
                    : "text-glacier-300 drop-shadow-[0_0_18px_rgba(99,213,230,0.3)]"
                }
                size={72}
                strokeWidth={1.3}
                aria-hidden="true"
              />
            </div>
            <div className="weather-metrics grid grid-cols-3 gap-2">
              <WeatherMetric
                icon={Wind}
                label="Wind"
                value={
                  weather ? `${Math.round(weather.windSpeedKmh)} km/h` : "—"
                }
              />
              <WeatherMetric
                icon={Snowflake}
                label="Gefühlt"
                value={
                  weather
                    ? `${Math.round(weather.apparentTemperatureCelsius)}°`
                    : "—"
                }
              />
              <WeatherMetric
                icon={Wind}
                label="Böen"
                value={
                  weather ? `${Math.round(weather.windGustsKmh)} km/h` : "—"
                }
              />
            </div>
            <div className="dashboard-footer">
              <span>Open-Meteo</span>
              <span>
                {weatherEnvelope?.fetchedAt
                  ? `Aktualisiert ${formatUpdateTime(weatherEnvelope.fetchedAt)}`
                  : weatherLoading
                    ? "Wird geladen"
                    : "Keine Daten"}
              </span>
            </div>
            {weatherResource.status === "error" && !weather && (
              <button
                className="mt-4 inline-flex items-center gap-2 text-[0.65rem] font-bold text-glacier-200 transition hover:text-ice-50"
                onClick={reload}
                type="button"
              >
                <RefreshCw size={13} aria-hidden="true" /> Erneut versuchen
              </button>
            )}
          </DataCard>

          <DataCard
            title="Schneedecke"
            subtitle="Plattenalm"
            icon={Snowflake}
            iconTone="blue"
            badge={
              <WeatherBadge
                loading={weatherLoading}
                stale={weatherStale}
                available={Boolean(weather)}
              />
            }
            className="min-h-[22rem]"
          >
            <div className="dashboard-metric min-h-32 py-4">
              <strong className="dashboard-value">
                {weather
                  ? formatResortNumber(Math.round(weather.snowDepthCentimeters))
                  : "—"}
                <small className="dashboard-unit">cm</small>
              </strong>
              <p className="dashboard-description">
                {weather
                  ? `Platenalm ${tripElevation()} m`
                  : weatherLoading
                    ? "Schneedaten werden geladen …"
                    : "Modellwert derzeit nicht verfügbar"}
              </p>
            </div>
            <div className="grid min-h-14 grid-cols-1">
              <MiniMetric
                label="Heute neu"
                value={
                  todayForecast
                    ? formatCentimeters(todayForecast.snowfallCentimeters)
                    : "—"
                }
              />
            </div>
            <div className="dashboard-footer">
              <a rel="noreferrer" target="_blank"></a>
              <a
                className="inline-flex items-center gap-1.5 font-semibold text-glacier-200/85 transition hover:text-glacier-200"
                href={officialSnowReport}
                rel="noreferrer"
                target="_blank"
              >
                Offizieller Bericht{" "}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
          </DataCard>

          <DataCard
            title="Geöffnete Pisten"
            subtitle="Zillertal Arena"
            icon={Route}
            iconTone="turquoise"
            badge={
              <ResortBadge
                loading={resortLoading}
                stale={resortStale}
                available={Boolean(resort)}
              />
            }
            className="min-h-[21rem]"
          >
            <div className="dashboard-metric min-h-32 py-4">
              <div className="min-w-0">
                <strong className="dashboard-value truncate">
                  {resort
                    ? formatResortNumber(resort.pisteKilometers.open)
                    : "—"}
                  <small className="dashboard-unit">km</small>
                </strong>
                <span className="dashboard-subline">
                  von{" "}
                  {resort
                    ? formatResortNumber(resort.pisteKilometers.total)
                    : "—"}{" "}
                  km geöffnet
                </span>
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-4">
                <p className="text-[0.7rem] leading-5 text-ice-200/40">
                  {resort
                    ? "Zillertal Arena gesamt"
                    : resortLoading
                      ? "Status wird geladen …"
                      : "Status derzeit nicht verfügbar"}
                </p>
                <strong className="shrink-0 text-lg font-semibold text-ice-50/70">
                  {pistePercent} %
                </strong>
              </div>
            </div>
            <div className="h-12 pt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
                <span
                  className="block h-full bg-turquoise-400 transition-[width] duration-700"
                  style={{ width: `${pistePercent}%` }}
                />
              </div>
            </div>
            <ResortSource
              envelope={resortEnvelope}
              loading={resortLoading}
            />
          </DataCard>

          <DataCard
            title="Lifte"
            subtitle="Zillertal Arena"
            icon={CableCar}
            iconTone="violet"
            badge={
              <ResortBadge
                loading={resortLoading}
                stale={resortStale}
                available={Boolean(resort)}
              />
            }
            className="min-h-[21rem]"
          >
            <div className="dashboard-metric min-h-32 py-4">
              <strong className="dashboard-value">
                {resort ? resort.lifts.open : "—"}
                <small className="dashboard-unit">
                  / {resort ? resort.lifts.total : "—"}
                </small>
              </strong>
              <span className="dashboard-subline">Lifte geöffnet</span>
              <div className="mt-4 flex items-baseline justify-between gap-4">
                <p className="text-[0.7rem] leading-5 text-ice-200/40">
                  {resort
                    ? "Zillertal Arena gesamt"
                    : resortLoading
                      ? "Liftstatus wird geladen …"
                      : "Liftstatus derzeit nicht verfügbar"}
                </p>
                <strong className="shrink-0 text-lg font-semibold text-ice-50/70">
                  {liftPercent} %
                </strong>
              </div>
            </div>
            <div className="h-12 pt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
                <span
                  className="block h-full bg-violet-400 transition-[width] duration-700"
                  style={{ width: `${liftPercent}%` }}
                />
              </div>
            </div>
            <ResortSource
              envelope={resortEnvelope}
              loading={resortLoading}
            />
            {resortResource.status === "error" && !resort && (
              <button
                className="mt-4 inline-flex items-center gap-2 text-[0.65rem] font-bold text-glacier-200 transition hover:text-ice-50"
                onClick={reloadResort}
                type="button"
              >
                <RefreshCw size={13} aria-hidden="true" /> Erneut versuchen
              </button>
            )}
          </DataCard>

          <DataCard
            title="Liftkarte Zillertal Arena"
            subtitle="Geografische Lage · Live-Status für Lifte und Pisten"
            icon={CableCar}
            iconTone="violet"
            badge={
              <ResortBadge
                loading={resortLoading}
                stale={resortStale}
                available={Boolean(resort)}
              />
            }
            className="lg:col-span-2"
          >
            <LiftMiniMap
              lifts={resort?.liftItems ?? []}
              pisteStatuses={resort?.pisteItems ?? []}
              webcams={resort?.webcams ?? []}
            />
          </DataCard>
        </div>
      </div>
    </section>
  );
}

function ResortBadge({
  loading,
  stale,
  available,
}: {
  loading: boolean;
  stale: boolean;
  available: boolean;
}) {
  if (stale) return <StatusBadge tone="warning">Veraltet</StatusBadge>;
  if (loading && !available) return <StatusBadge tone="info">Lädt</StatusBadge>;
  if (available) return <StatusBadge tone="success">Gemeldet</StatusBadge>;
  return <StatusBadge>Nicht verfügbar</StatusBadge>;
}

function WeatherBadge({
  loading,
  stale,
  available,
}: {
  loading: boolean;
  stale: boolean;
  available: boolean;
}) {
  if (stale) return <StatusBadge tone="warning">Veraltet</StatusBadge>;
  if (loading && !available) return <StatusBadge tone="info">Lädt</StatusBadge>;
  if (available) return <StatusBadge tone="success">Aktuell</StatusBadge>;
  return <StatusBadge>Nicht verfügbar</StatusBadge>;
}

function formatUpdateTime(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ResortSource({
  envelope,
  loading,
}: {
  envelope: ReturnType<typeof useResortData>["resource"]["data"];
  loading: boolean;
}) {
  return (
    <div className="dashboard-footer">
      <span>status.live</span>
      <span>
        {envelope?.observedAt
          ? `Stand ${formatUpdateTime(envelope.observedAt)}`
          : loading
            ? "Wird geladen"
            : "Keine Daten"}
      </span>
    </div>
  );
}

function formatResortNumber(value: number | null): string {
  return value === null
    ? "—"
    : value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

function formatCentimeters(value: number): string {
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} cm`;
}

function tripElevation(): string {
  return new Intl.NumberFormat("de-DE").format(
    tripConfig.weatherLocation.elevation,
  );
}

function WeatherMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wind;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
      <Icon
        className="shrink-0 text-glacier-300/80"
        size={14}
        aria-hidden="true"
      />
      <span className="min-w-0 truncate text-[0.5rem] tracking-wider text-ice-200/40 uppercase">
        {label}
      </span>
      <strong className="ml-auto shrink-0 whitespace-nowrap text-[0.7rem] font-semibold text-ice-50/80">
        {value}
      </strong>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
      <span className="min-w-0 truncate text-[0.5rem] tracking-wider text-ice-200/40 uppercase">
        {label}
      </span>
      <b className="ml-auto shrink-0 whitespace-nowrap text-[0.7rem] font-semibold text-ice-50/80">
        {value}
      </b>
    </span>
  );
}
