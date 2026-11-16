import {
  ArrowRight,
  Camera,
  ChevronDown,
  Cloud,
  Droplets,
  Snowflake,
  Wind,
} from "lucide-react";
import { useState } from "react";
import type { CSSProperties } from "react";

import { tripConfig } from "@/app/trip-config";
import heroImage from "@/assets/hochkrimml-hero-v2.png";
import { IconTile } from "@/components/ui/IconTile";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useWeatherData } from "@/components/weather/WeatherDataProvider";
import { weatherPresentation } from "@/data/weather/weather-code";
import type { DailyForecast, HourlyForecast } from "@/types/weather";

const officialLivecams =
  "https://www.zillertalarena.com/info-service/livecams-wetter/livecams/";

function dateParts(value: string, index: number) {
  const date = new Date(value);
  return {
    label:
      index === 0
        ? "Heute"
        : new Intl.DateTimeFormat("de-DE", {
            weekday: "short",
            timeZone: tripConfig.timeZone,
          })
            .format(date)
            .replace(".", ""),
    date: new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "short",
      timeZone: tripConfig.timeZone,
    }).format(date),
  };
}

export function ForecastPreview() {
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const { resource } = useWeatherData();
  const envelope = resource.data;
  const forecast = envelope?.data?.forecast ?? [];
  const available = Boolean(envelope?.data?.forecast);
  const loading = resource.status === "idle" || resource.status === "loading";
  const stale = envelope?.freshness === "stale";
  const selectedDay =
    selectedDayIndex === null ? null : forecast[selectedDayIndex];
  const selectedHours = selectedDay
    ? (envelope?.data?.hourly ?? []).filter(
        (hour) => hour.time.slice(0, 10) === selectedDay.date.slice(0, 10),
      )
    : [];

  const selectDay = (index: number) => {
    if (!available) return;
    setSelectedDayIndex((current) => (current === index ? null : index));
  };

  return (
    <section className="forecast-section section-shell" id="forecast">
      <div className="shell">
        <div className="mb-14 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow text-ice-200/55">
              <span /> 7-Tage-Ausblick
            </p>
            <h2 className="section-title">
              Der Berg
              <br />
              <em className="outline-heading subtle">voraus.</em>
            </h2>
          </div>
          <div className="flex items-center gap-4 text-[0.65rem] leading-5 text-ice-200/45">
            <ForecastBadge
              loading={loading}
              stale={stale}
              available={available}
            />
            <p>
              {available ? (
                <></>
              ) : loading ? (
                <>
                  Prognose wird
                  <br />
                  geladen …
                </>
              ) : (
                <>
                  Prognose derzeit
                  <br />
                  nicht verfügbar.
                </>
              )}
            </p>
          </div>
        </div>

        <div
          className="forecast-strip"
          role="list"
          aria-label={
            available
              ? "7-Tage-Modellprognose"
              : "7-Tage-Prognose ohne verfügbare Daten"
          }
        >
          {forecast.map((day, index) => (
            <ForecastDayCard
              day={day}
              available={available}
              index={index}
              key={day.date}
              onSelect={() => selectDay(index)}
              selected={selectedDayIndex === index}
            />
          ))}
        </div>

        {selectedDay && (
          <HourlyForecastPanel
            day={selectedDay}
            dayIndex={selectedDayIndex ?? 0}
            hours={selectedHours}
            onClose={() => setSelectedDayIndex(null)}
          />
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <SnowForecastCard
            available={available}
            forecast={forecast}
            loading={loading}
            stale={stale}
          />
          <WebcamCard />
        </div>
      </div>
    </section>
  );
}

function ForecastDayCard({
  day,
  available,
  index,
  onSelect,
  selected,
}: {
  day: DailyForecast;
  available: boolean;
  index: number;
  onSelect: () => void;
  selected: boolean;
}) {
  const presentation = available ? weatherPresentation(day.weatherCode) : null;
  const Icon = presentation?.icon ?? Cloud;
  const date = dateParts(day.date, index);

  return (
    <div
      className={`forecast-day ${index === 0 ? "is-today" : ""} ${selected ? "is-selected" : ""}`}
      role="listitem"
    >
      <button
        aria-controls="hourly-detail"
        aria-expanded={selected}
        className="flex size-full flex-col items-center text-ice-50 disabled:cursor-default"
        disabled={!available}
        onClick={onSelect}
        type="button"
      >
        <p className="m-0 text-xs font-bold">{date.label}</p>
        <span className="mt-1 text-[0.6rem] text-ice-200/40">{date.date}</span>
        <Icon
          className={`my-6 ${presentation?.isSunny ? "text-amber-300" : "text-glacier-300"}`}
          size={31}
          strokeWidth={1.6}
          aria-label={presentation?.label}
        />
        <strong className="text-2xl font-medium">
          {available ? `${Math.round(day.temperatureMaxCelsius)}°` : "—"}
        </strong>
        <small className="mt-1 mb-4 text-xs text-ice-200/40">
          {available ? `${Math.round(day.temperatureMinCelsius)}°` : "—"}
        </small>
        <span className="flex items-center gap-2 rounded-lg bg-glacier-400/8 px-2 py-1 text-[0.6rem] font-bold text-glacier-200/85">
          {available
            ? `${day.snowfallCentimeters.toLocaleString("de-DE", { maximumFractionDigits: 1 })} cm`
            : "—"}
          {available && (
            <ChevronDown
              className={`transition-transform ${selected ? "rotate-180" : ""}`}
              size={12}
              aria-hidden="true"
            />
          )}
        </span>
      </button>
    </div>
  );
}

function HourlyForecastPanel({
  day,
  dayIndex,
  hours,
  onClose,
}: {
  day: DailyForecast;
  dayIndex: number;
  hours: HourlyForecast[];
  onClose: () => void;
}) {
  const date = dateParts(day.date, dayIndex);
  const visibleHours = hours.filter((_, index) => index % 2 === 0);
  const maxSnow = Math.max(
    0.1,
    ...visibleHours.map((hour) => hour.snowfallCentimeters),
  );
  const snowTotal = hours.reduce(
    (sum, hour) => sum + hour.snowfallCentimeters,
    0,
  );

  return (
    <section
      className="hourly-panel glass-panel mt-4 overflow-hidden p-6 sm:p-8"
      id="hourly-detail"
      aria-labelledby="hourly-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="card-kicker">2-Stunden-Prognose · {date.date}</p>
          <h3
            className="text-2xl font-semibold tracking-[-0.035em]"
            id="hourly-title"
          >
            {date.label} im Detail
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-glacier-400/15 bg-glacier-400/8 px-3 py-2 text-[0.65rem] text-glacier-200">
            <Snowflake size={14} aria-hidden="true" />{" "}
            {snowTotal.toLocaleString("de-DE", { maximumFractionDigits: 1 })} cm
            gesamt
          </span>
          <button
            className="rounded-full border border-white/10 p-2 text-ice-200/60 transition hover:border-white/20 hover:text-ice-50"
            onClick={onClose}
            type="button"
            aria-label="Stundenansicht schließen"
          >
            <ChevronDown className="rotate-180" size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {visibleHours.length > 0 ? (
        <div
          className="hourly-scroll mt-8"
          role="list"
          aria-label={`Wetterprognose im Zwei-Stunden-Raster für ${date.date}`}
        >
          {visibleHours.map((hour) => (
            <HourlyForecastItem hour={hour} key={hour.time} maxSnow={maxSnow} />
          ))}
        </div>
      ) : (
        <p className="mt-8 text-sm text-ice-200/50">
          Für diesen Tag sind keine Stundenwerte verfügbar.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/8 pt-4 text-[0.6rem] text-ice-200/40">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-glacier-300" /> Schneefall pro
          Stunde
        </span>
      </div>
    </section>
  );
}

function HourlyForecastItem({
  hour,
  maxSnow,
}: {
  hour: HourlyForecast;
  maxSnow: number;
}) {
  const presentation = weatherPresentation(hour.weatherCode);
  const Icon = presentation.icon;
  const snowHeight =
    hour.snowfallCentimeters === 0
      ? 2
      : Math.max(8, Math.round((hour.snowfallCentimeters / maxSnow) * 100));
  const time = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tripConfig.timeZone,
  }).format(new Date(hour.time));
  const snowStyle = {
    "--hourly-snow-height": `${snowHeight}%`,
  } as CSSProperties;

  return (
    <article className="hourly-item" role="listitem" title={presentation.label}>
      <time
        className="text-[0.65rem] font-bold text-ice-200/65"
        dateTime={hour.time}
      >
        {time}
      </time>
      <Icon
        className={presentation.isSunny ? "text-amber-300" : "text-glacier-300"}
        size={22}
        strokeWidth={1.6}
        aria-label={presentation.label}
      />
      <strong className="text-lg font-medium">
        {Math.round(hour.temperatureCelsius)}°
      </strong>
      <div
        className="hourly-snow-track"
        aria-label={`${hour.snowfallCentimeters} Zentimeter Schneefall`}
        style={snowStyle}
      >
        {hour.snowfallCentimeters > 0 && (
          <b>
            {hour.snowfallCentimeters.toLocaleString("de-DE", {
              maximumFractionDigits: 1,
            })}
          </b>
        )}
        <i style={{ height: `${snowHeight}%` }} />
      </div>
      <span className="inline-flex items-center gap-1 text-[0.55rem] text-ice-200/45">
        <Droplets size={10} aria-hidden="true" />{" "}
        {hour.precipitationProbabilityPercent}%
      </span>
      <span className="inline-flex items-center gap-1 text-[0.55rem] text-ice-200/45">
        <Wind size={10} aria-hidden="true" /> {Math.round(hour.windSpeedKmh)}
      </span>
    </article>
  );
}

function SnowForecastCard({
  available,
  forecast,
  loading,
  stale,
}: {
  available: boolean;
  forecast: DailyForecast[];
  loading: boolean;
  stale: boolean;
}) {
  const maxSnow = Math.max(
    0,
    ...forecast.map((day) => day.snowfallCentimeters),
  );
  const scaleMax = snowScaleMaximum(maxSnow);
  const scaleLabels = [scaleMax, (scaleMax * 2) / 3, scaleMax / 3, 0];
  return (
    <article className="glass-panel min-h-[27.5rem] p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="card-kicker">Modellprognose</p>
          <h3 className="text-2xl font-semibold tracking-[-0.035em]">
            Erwarteter Neuschnee
          </h3>
        </div>
        <ForecastBadge
          loading={loading}
          stale={stale}
          available={available}
        />
      </div>
      <div className="mt-10 grid h-64 grid-cols-[2.7rem_1fr]">
        <div className="flex flex-col justify-between pb-7 text-[0.55rem] text-ice-200/35">
          {scaleLabels.map((value, index) => (
            <span key={value}>
              {formatSnowValue(value)}{index === 0 ? " cm" : ""}
            </span>
          ))}
        </div>
        <div className="snow-bars">
          {forecast.map((day, index) => (
            <SnowBar
              day={dateParts(day.date, index).label.slice(0, 2)}
              isPeak={
                available &&
                maxSnow > 0 &&
                day.snowfallCentimeters === maxSnow
              }
              key={day.date}
              max={scaleMax}
              value={available ? day.snowfallCentimeters : 0}
              available={available}
            />
          ))}
        </div>
      </div>
      <p className="mt-3 ml-11 text-[0.6rem] text-ice-200/35">
        {available ? (
          "Open-Meteo · Modellprognose"
        ) : loading ? (
          "Prognosedaten werden geladen …"
        ) : (
          "Keine Prognosedaten verfügbar"
        )}
      </p>
    </article>
  );
}

function ForecastBadge({
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

function SnowBar({
  day,
  value,
  max,
  isPeak,
  available,
}: {
  day: string;
  value: number;
  max: number;
  isPeak: boolean;
  available: boolean;
}) {
  const height = value === 0 ? 1 : Math.round((value / max) * 100);
  const style = { "--bar-height": `${height}%` } as CSSProperties;
  return (
    <div className="snow-bar" style={style}>
      <b>{available ? formatSnowValue(value) : "—"}</b>
      <i className={isPeak ? "is-peak" : ""} />
      <span>{day}</span>
    </div>
  );
}

function snowScaleMaximum(value: number) {
  if (value <= 0) return 3;
  const targetStep = value / 3;
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const normalizedStep = targetStep / magnitude;
  const factor = [1, 2, 3, 4, 5, 10].find(
    (candidate) => candidate >= normalizedStep,
  ) ?? 10;
  return factor * magnitude * 3;
}

function formatSnowValue(value: number) {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

function WebcamCard() {
  return (
    <article
      className="relative min-h-[27.5rem] overflow-hidden rounded-3xl border border-ice-200/15 bg-cover bg-[68%_center]"
      style={{ backgroundImage: `url(${heroImage})` }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,14,24,0.94),rgba(5,14,24,0.38)),linear-gradient(0deg,rgba(5,14,24,0.74),transparent)]" />
      <div className="relative z-10 flex h-full min-h-[27.5rem] flex-col items-start p-6 sm:p-8">
        <IconTile icon={Camera} tone="cyan" />
        <div className="mt-auto">
          <p className="card-kicker">Live aus Hochkrimml</p>
          <h3 className="text-3xl leading-[1.05] font-semibold tracking-[-0.04em]">
            Ein Blick auf
            <br /> den Berg.
          </h3>
        </div>
        <a
          className="mt-7 flex w-full items-center justify-between rounded-xl bg-ice-50 px-4 py-4 text-xs font-extrabold text-midnight-950 transition hover:bg-glacier-200"
          href={officialLivecams}
          rel="noreferrer"
          target="_blank"
        >
          Offizielle Livecams <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
