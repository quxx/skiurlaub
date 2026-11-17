import { tripConfig } from '@/app/trip-config';
import { formatSourceTime } from '@/data/date-time';
import { officialSnowReport } from '@/data/snow/provider';
import { Link } from 'react-router';

export function TripInformation() {
  return (
    <section
      className="trip-information shell"
      aria-labelledby="trip-info-title"
    >
      <h2 id="trip-info-title">Dein Urlaub im Überblick</h2>
      <dl>
        <div>
          <dt>Reiseziel</dt>
          <dd>
            {tripConfig.destination} · {tripConfig.region}
          </dd>
        </div>
        <div>
          <dt>Reisebeginn</dt>
          <dd>{formatSourceTime(tripConfig.startsAt, tripConfig.timeZone)}</dd>
        </div>
        <div>
          <dt>Reiseende</dt>
          <dd>
            {tripConfig.endsAt
              ? formatSourceTime(tripConfig.endsAt, tripConfig.timeZone)
              : 'Noch nicht festgelegt'}
          </dd>
        </div>
      </dl>
      <a
        href="https://www.zillertalarena.com/winter/"
        target="_blank"
        rel="noreferrer"
      >
        Aktuelle Informationen der Zillertal Arena ↗
      </a>
      <p className="mt-4 text-sm">
        Persönliche und Gruppenstatistiken sind noch nicht verfügbar.{' '}
        <Link to="/gruppe">Zur Gruppenübersicht</Link>
      </p>
      <details>
        <summary>Datenquellen und Hinweise</summary>
        <p>
          Wetter, Schneedecke und Neuschnee sind Modellwerte von{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo (CC BY 4.0)
          </a>
          . Eine Prognose ist keine gemessene Schneehöhe.
        </p>
        <p>
          Lift- und Pistenstatus stammen von{' '}
          <a
            href="https://status.live/ski/zillertal-arena"
            target="_blank"
            rel="noreferrer"
          >
            status.live
          </a>
          , einem nichtoffiziellen Drittanbieter. Meldungen können verzögert
          sein. Schilder, Sperren und offizielle Anzeigen vor Ort sind
          maßgeblich.
        </p>
        <p>
          Eine freigegebene Schnittstelle für offizielle Schneehöhen ist noch
          nicht angebunden. Nutze den{' '}
          <a href={officialSnowReport} target="_blank" rel="noreferrer">
            offiziellen Schneebericht
          </a>
          .
        </p>
        <p>
          Kartendaten: OpenStreetMap/OpenSkiData (ODbL), Pistengeometrien über
          LiftRadar. Kein offizieller Navigationsplan; Karten benötigen Netz.
        </p>
      </details>
    </section>
  );
}
