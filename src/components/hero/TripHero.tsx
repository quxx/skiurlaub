import { ArrowDown, CalendarDays, CloudSnow, MountainSnow, Wind } from 'lucide-react';

import { tripConfig } from '@/app/trip-config';
import heroImage from '@/assets/hochkrimml-hero-v2.png';
import { Countdown } from '@/components/countdown/Countdown';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useWeatherData } from '@/components/weather/WeatherDataProvider';
import { useTripMode } from '@/hooks/useTripMode';

function formattedStartDate(): string {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: tripConfig.timeZone }).format(new Date(tripConfig.startsAt));
}

const modeLabel = { anticipation: 'Vorfreude', onTrip: 'Im Skiurlaub', afterTrip: 'Reise beendet' } as const;

export function TripHero() {
  const mode = useTripMode(tripConfig);
  const { resource: weatherResource } = useWeatherData();

  return (
    <header className="relative isolate min-h-[54rem] overflow-hidden" data-mode={mode}>
      <img
        className="absolute inset-0 -z-30 size-full scale-[1.015] object-cover object-[58%_center]"
        src={heroImage}
        alt=""
        fetchPriority="high"
      />
      <div className="hero-shade absolute inset-0 -z-20" aria-hidden="true" />

      <nav className="shell flex h-28 items-center justify-between border-b border-white/10">
        <a className="inline-flex items-center gap-3 text-xs font-bold tracking-[0.16em]" href="#top">
          <span className="grid size-10 place-items-center rounded-full border border-glacier-400/30 bg-midnight-950/40 text-glacier-300"><MountainSnow size={22} strokeWidth={1.7} aria-hidden="true" /></span>
          <span>SKITRIP <b className="text-glacier-300">2027</b></span>
        </a>
        <div className="hidden items-center gap-6 sm:flex">
          <StatusBadge tone={mode === 'onTrip' ? 'success' : 'info'}>{modeLabel[mode]}</StatusBadge>
          <a className="text-xs text-ice-200/75 transition hover:text-ice-50" href="#conditions">Dashboard</a>
        </div>
      </nav>

      <div className="shell grid gap-12 pt-24 pb-32 lg:grid-cols-[1fr_minmax(30rem,0.8fr)] lg:items-end lg:gap-20 lg:pt-32" id="top">
        <div className="mode-enter" key={`intro-${mode}`}>
          <p className="eyebrow"><span /> {tripConfig.region} · {tripConfig.country}</p>
          <p className="mb-3 text-xs font-extrabold tracking-[0.14em] text-glacier-200 uppercase">
            {mode === 'afterTrip' ? 'Unvergessliche Tage im Schnee' : `Ab ${formattedStartDate()}`}
          </p>
          <h1 className="text-[clamp(4rem,10vw,8.7rem)] leading-[0.82] font-bold tracking-[-0.075em] uppercase">
            {mode === 'onTrip' ? "It's Ski" : 'Hochkrimml'}<br />
            <em className="outline-heading">{mode === 'onTrip' ? 'Time!' : '2027'}</em>
          </h1>
          <p className="mt-8 max-w-xl text-base leading-7 text-ice-200/75">
            {mode === 'anticipation' && 'Die Berge rufen. Noch ein Blick auf die Zeit – dann geht es endlich in den Schnee.'}
            {mode === 'onTrip' && 'Der Urlaub läuft. Wetter, Schnee und Resortstatus stehen jetzt im Mittelpunkt.'}
            {mode === 'afterTrip' && 'Der Skiurlaub ist vorbei – die Vorfreude auf das nächste Bergabenteuer bleibt.'}
          </p>
        </div>

        <div className="mode-enter" key={`panel-${mode}`}>
          {mode === 'anticipation' && <AnticipationPanel />}
          {mode === 'onTrip' && <OnTripPanel resource={weatherResource} />}
          {mode === 'afterTrip' && <AfterTripPanel />}
        </div>
      </div>

      <a className="absolute bottom-9 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-[0.6rem] font-bold tracking-[0.14em] text-ice-200/60 uppercase" href="#conditions">
        Dashboard ansehen <ArrowDown size={16} aria-hidden="true" />
      </a>
    </header>
  );
}

function AnticipationPanel() {
  return (
    <section className="glass-panel p-6 sm:p-8" aria-labelledby="countdown-title">
      <div className="flex items-start justify-between gap-4">
        <div><p className="card-kicker">Countdown</p><h2 className="text-lg font-semibold" id="countdown-title">Die Vorfreude läuft</h2></div>
        <StatusBadge tone="info">{tripConfig.timeZone}</StatusBadge>
      </div>
      <Countdown />
      <div className="flex items-center justify-between gap-4 border-t border-white/8 pt-5 text-[0.65rem] text-ice-200/50">
        <span>Reisebeginn</span><span className="font-bold text-ice-50/80">{formattedStartDate()}</span>
      </div>
    </section>
  );
}

function OnTripPanel({ resource }: { resource: ReturnType<typeof useWeatherData>['resource'] }) {
  const weather = resource.data?.data?.current ?? null;
  const isLoading = resource.status === 'idle' || resource.status === 'loading';
  const isStale = resource.data?.freshness === 'stale';
  const badge = isStale ? 'Veraltet' : isLoading ? 'Lädt' : weather ? 'Aktuell' : 'Nicht verfügbar';
  return (
    <section className="glass-panel p-6 sm:p-8" aria-labelledby="trip-now-title">
      <div className="flex items-start justify-between gap-4">
        <div><p className="card-kicker">Heute am Berg</p><h2 className="text-lg font-semibold" id="trip-now-title">Schnellüberblick</h2></div>
        <StatusBadge tone={isStale ? 'warning' : weather ? 'success' : 'muted'}>{badge}</StatusBadge>
      </div>
      <div className="my-8 grid grid-cols-2 gap-3">
        <HeroMetric icon={CloudSnow} label="Temperatur" value={weather ? `${Math.round(weather.temperatureCelsius)}°` : '—'} />
        <HeroMetric icon={Wind} label="Wind" value={weather ? `${Math.round(weather.windSpeedKmh)} km/h` : '—'} />
      </div>
      <p className="border-t border-white/8 pt-5 text-[0.65rem] text-ice-200/50">{weather ? 'Modellwetter von Open-Meteo' : 'Wetterdaten konnten nicht geladen werden.'}</p>
    </section>
  );
}

function AfterTripPanel() {
  return (
    <section className="glass-panel p-6 sm:p-8" aria-labelledby="after-trip-title">
      <CalendarDays className="mb-8 text-glacier-300" size={40} strokeWidth={1.4} aria-hidden="true" />
      <p className="card-kicker">Rückblick</p>
      <h2 className="text-2xl font-semibold" id="after-trip-title">Bis bald, Hochkrimml.</h2>
      <p className="mt-4 text-sm leading-7 text-ice-200/55">Der Countdown ist beendet. Das Dashboard bleibt als Erinnerung und Basis für den nächsten Trip erhalten.</p>
    </section>
  );
}

function HeroMetric({ icon: Icon, label, value }: { icon: typeof Wind; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-5">
      <Icon className="text-glacier-300" size={22} aria-hidden="true" />
      <span className="mt-5 block text-[0.55rem] tracking-wider text-ice-200/45 uppercase">{label}</span>
      <strong className="mt-1 block text-2xl">{value}</strong>
    </div>
  );
}
