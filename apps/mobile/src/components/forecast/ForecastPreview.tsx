import { Camera, ChevronDown, ChevronRight, Snowflake } from 'lucide-react';
import { useState } from 'react';
import { useAndroidBack } from '@/app/NativeLifecycle';
import { localDateKey } from '@/data/date-time';
import { tripConfig } from '@/app/trip-config';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useWeatherData } from '@/components/weather/WeatherDataProvider';
import { weatherPresentation } from '@/data/weather/weather-code';

function dateLabel(value: string) {
  return value.slice(0, 10) === localDateKey(Date.now(), tripConfig.timeZone)
    ? 'Heute'
    : new Intl.DateTimeFormat('de-DE', {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
        timeZone: tripConfig.timeZone,
      }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}
export function ForecastPreview() {
  const [selected, setSelected] = useState<number | null>(null);
  useAndroidBack(() => setSelected(null), selected !== null);
  const { resource } = useWeatherData();
  const forecast = resource.data?.data?.forecast ?? [];
  const hours = resource.data?.data?.hourly ?? [];
  const available = forecast.length > 0;
  const stale = resource.data?.freshness === 'stale';
  return (
    <section className="forecast-section shell" id="forecast">
      <div className="list-section-heading">
        <h2>Wetter · 7 Tage</h2>
        {stale && <StatusBadge tone="warning">Veraltet</StatusBadge>}
      </div>
      {!available && (
        <p className="inline-message" role="status">
          {resource.status === 'loading'
            ? 'Die Prognose wird geladen …'
            : 'Die Wetterquelle ist derzeit nicht verfügbar. Bitte nutze die Aktualisierung im Dashboard.'}
        </p>
      )}
      <div className="forecast-strip" role="list" aria-label="7-Tage-Prognose">
        {forecast.map((day, index) => {
          const view = weatherPresentation(day.weatherCode);
          const Icon = view.icon;
          const open = selected === index;
          const dayHours = hours.filter(
            (hour) =>
              localDateKey(hour.time, tripConfig.timeZone) ===
              day.date.slice(0, 10),
          );
          return (
            <div
              className={`forecast-day ${open ? 'is-selected' : ''}`}
              key={day.date}
              role="listitem"
            >
              <button
                type="button"
                className="forecast-row"
                onClick={() => setSelected(open ? null : index)}
                aria-expanded={open}
                aria-controls={`forecast-hours-${index}`}
              >
                <span className="forecast-date">{dateLabel(day.date)}</span>
                <Icon size={24} strokeWidth={1.7} aria-label={view.label} />
                <span className="forecast-snow">
                  <Snowflake size={14} aria-hidden="true" />
                  {day.snowfallCentimeters.toLocaleString('de-DE', {
                    maximumFractionDigits: 1,
                  })}{' '}
                  cm
                </span>
                <strong>
                  <span>{Math.round(day.temperatureMaxCelsius)}°</span>
                  <small>{Math.round(day.temperatureMinCelsius)}°</small>
                </strong>
                <ChevronDown
                  size={18}
                  className="forecast-chevron"
                  aria-hidden="true"
                />
              </button>
              {open && (
                <section
                  className="hourly-panel"
                  id={`forecast-hours-${index}`}
                  aria-label={`Stundenwerte ${dateLabel(day.date)}`}
                >
                  <div className="hourly-scroll" role="list">
                    {dayHours
                      .filter((_, i) => i % 2 === 0)
                      .map((hour) => {
                        const HourIcon = weatherPresentation(
                          hour.weatherCode,
                        ).icon;
                        return (
                          <div
                            className="hourly-item"
                            key={hour.time}
                            role="listitem"
                          >
                            <span>
                              {new Intl.DateTimeFormat('de-DE', {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: tripConfig.timeZone,
                              }).format(new Date(hour.time))}
                            </span>
                            <HourIcon
                              size={22}
                              strokeWidth={1.7}
                              aria-hidden="true"
                            />
                            <strong>
                              {Math.round(hour.temperatureCelsius)}°
                            </strong>
                            <small>
                              {hour.snowfallCentimeters.toLocaleString(
                                'de-DE',
                                { maximumFractionDigits: 1 },
                              )}{' '}
                              cm
                            </small>
                          </div>
                        );
                      })}
                  </div>
                  {!dayHours.length && <p>Keine Stundenwerte verfügbar.</p>}
                </section>
              )}
            </div>
          );
        })}
      </div>
      <a
        className="resort-row action-row livecam-row"
        href="https://www.zillertalarena.com/info-service/livecams-wetter/livecams/"
        target="_blank"
        rel="noreferrer"
      >
        <Camera size={24} strokeWidth={1.8} aria-hidden="true" />
        <div>
          <h3>Livecams</h3>
          <p>Offizielle Kameras der Zillertal Arena</p>
        </div>
        <ChevronRight size={22} aria-hidden="true" />
      </a>
    </section>
  );
}
