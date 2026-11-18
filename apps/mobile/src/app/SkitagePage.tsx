import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { EmptyPage } from '@/app/EmptyPage';
import { tripConfig } from '@/app/trip-config';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  gps,
  gpsAvailable,
  hasGpsConsent,
  loadTracks,
  saveGpsConsent,
  useGpsStatus,
} from '@/data/gps-client';
import type { TrackMeta } from '@/data/gps-client';

export const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0
    ? `${h} h ${String(m).padStart(2, '0')} min`
    : `${m} min ${String(total % 60).padStart(2, '0')} s`;
};
const dateTime = (ms: number) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: tripConfig.timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));

function ConsentCard({
  onAccept,
  onCancel,
}: {
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="gps-consent" aria-labelledby="gps-consent-title">
      <h2 id="gps-consent-title">GPS-Aufzeichnung starten?</h2>
      <ul>
        <li>
          Aufgezeichnet werden Position, Höhe, Genauigkeit und Luftdruck samt
          Uhrzeit – auch bei gesperrtem Display.
        </li>
        <li>
          Solange du nichts hochlädst, bleiben die Daten nur auf diesem Handy.
        </li>
        <li>
          Eine dauerhafte Benachrichtigung zeigt die laufende Aufzeichnung. Du
          kannst sie dort oder hier jederzeit pausieren oder beenden.
        </li>
        <li>
          Die Aufzeichnung startet nie von selbst und kostet Akku. Mit der
          Gruppe wird nichts geteilt, solange du das nicht ausdrücklich
          einstellst.
        </li>
      </ul>
      <div className="auth-actions">
        <Button variant="primary" static onClick={onAccept}>
          Zustimmen und starten
        </Button>
        <Button variant="text" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </section>
  );
}

function Recorder() {
  const status = useGpsStatus();
  const client = useQueryClient();
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const state = status?.state ?? 'idle';
  useEffect(() => {
    if (state === 'idle') void client.invalidateQueries({ queryKey: ['gps'] });
  }, [state, client]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Das hat nicht geklappt.',
      );
    } finally {
      setBusy(false);
    }
  };
  const begin = () =>
    run(async () => {
      const permissions = await gps.requestTrackingPermissions();
      if (!permissions.location) {
        setMessage(
          'Ohne Standortberechtigung kann nicht aufgezeichnet werden. Du kannst sie in den Android-Einstellungen erteilen.',
        );
        return;
      }
      await gps.start({ consent: true });
    });
  const elapsed =
    status && status.startedAt ? (Date.now() - status.startedAt) / 1000 : 0;

  if (consent)
    return (
      <ConsentCard
        onAccept={() => {
          saveGpsConsent();
          setConsent(false);
          void begin();
        }}
        onCancel={() => setConsent(false)}
      />
    );
  return (
    <section className="gps-card" aria-label="GPS-Aufzeichnung">
      <div className="gps-card__head">
        <span className="gps-card__icon" data-state={state} aria-hidden="true">
          <Radio size={22} />
        </span>
        <div>
          <h2>
            {state === 'recording'
              ? 'Aufzeichnung läuft'
              : state === 'paused'
                ? 'Pausiert'
                : 'GPS-Aufzeichnung'}
          </h2>
          <p>
            {state === 'idle'
              ? 'Optional und nur auf Knopfdruck.'
              : `${formatDuration(elapsed)} seit dem Start`}
          </p>
        </div>
      </div>
      {state !== 'idle' && status && (
        <dl className="gps-live">
          <div>
            <dt>Punkte</dt>
            <dd>{status.pointCount}</dd>
          </div>
          <div>
            <dt>Strecke</dt>
            <dd>{(status.distanceM / 1000).toFixed(1)} km</dd>
          </div>
          <div>
            <dt>Genauigkeit</dt>
            <dd>
              {status.lastAccuracy >= 0
                ? `±${Math.round(status.lastAccuracy)} m`
                : '–'}
            </dd>
          </div>
          <div>
            <dt>Intervall</dt>
            <dd>{status.intervalMs / 1000} s</dd>
          </div>
        </dl>
      )}
      <div className="auth-actions">
        {state === 'idle' && (
          <Button
            variant="primary"
            static
            busy={busy}
            onClick={() => (hasGpsConsent() ? void begin() : setConsent(true))}
          >
            Aufzeichnung starten
          </Button>
        )}
        {state === 'recording' && (
          <Button static busy={busy} onClick={() => void run(gps.pause)}>
            Pause
          </Button>
        )}
        {state === 'paused' && (
          <Button
            variant="primary"
            static
            busy={busy}
            onClick={() => void run(gps.resume)}
          >
            Fortsetzen
          </Button>
        )}
        {state !== 'idle' && (
          <Button
            variant="danger"
            busy={busy}
            onClick={() => void run(gps.stop)}
          >
            Beenden
          </Button>
        )}
      </div>
      {(message || status?.error) && (
        <p className="auth-error" role="alert">
          {message ?? status?.error}
        </p>
      )}
    </section>
  );
}

const stateLabel: Record<TrackMeta['state'], string> = {
  recording: 'Läuft',
  paused: 'Pausiert',
  stopped: 'Beendet',
  interrupted: 'Unterbrochen',
};

function TrackList() {
  const tracks = useQuery({ queryKey: ['gps', 'tracks'], queryFn: loadTracks });
  if (tracks.isPending)
    return <p role="status">Aufzeichnungen werden geladen …</p>;
  if (tracks.error)
    return (
      <p className="auth-error" role="alert">
        Aufzeichnungen konnten nicht gelesen werden.
      </p>
    );
  if (!tracks.data.length)
    return (
      <p className="gps-empty">
        Noch keine Aufzeichnungen. Starte oben deine erste.
      </p>
    );
  return (
    <ul className="gps-tracks">
      {tracks.data.map((track) => {
        // The running recording is still being written; it opens once it is finished.
        const active = track.state === 'recording' || track.state === 'paused';
        return (
          <li key={track.id}>
            <Link
              className="resort-row action-row"
              to={`/skitage/${track.id}`}
              aria-disabled={active || undefined}
              onClick={(event) => {
                if (active) event.preventDefault();
              }}
            >
              <CalendarDays size={24} strokeWidth={1.8} aria-hidden="true" />
              <div>
                <h3>{dateTime(track.startedAt)}</h3>
                <p>
                  {track.pointCount} Punkte
                  {track.endedAt
                    ? ` · ${formatDuration((track.endedAt - track.startedAt) / 1000)}`
                    : ''}
                </p>
              </div>
              {track.state !== 'stopped' && (
                <StatusBadge
                  tone={track.state === 'interrupted' ? 'warning' : 'info'}
                >
                  {stateLabel[track.state]}
                </StatusBadge>
              )}
              <ChevronRight size={22} aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SkitagePage() {
  if (!gpsAvailable)
    return (
      <EmptyPage
        title="Skitage"
        icon={CalendarDays}
        description="Die GPS-Aufzeichnung gibt es nur in der Android-App."
      />
    );
  return (
    <section className="shell skitage-page">
      <Recorder />
      <h2 className="gps-heading">Aufzeichnungen</h2>
      <TrackList />
    </section>
  );
}
