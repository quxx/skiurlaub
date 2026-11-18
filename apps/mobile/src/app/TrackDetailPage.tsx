import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  analyzeTrack,
  bytesToBase64,
  compressTrack,
  uploadStats,
} from '@skiurlaub/gps';
import {
  gpsTrackSummarySchema,
  gpsTracksResponseSchema,
} from '@skiurlaub/shared';
import { z } from 'zod';
import { api, ApiError } from '@/data/auth-client';
import { formatDuration } from '@/app/SkitagePage';
import { tripConfig } from '@/app/trip-config';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { TrackMap } from '@/components/track/TrackMap';
import { gps, loadTrack } from '@/data/gps-client';

const warningText: Record<string, string> = {
  too_few_points: 'Zu wenige Punkte für eine Auswertung.',
  no_altitude: 'Keine Höhendaten: Höhenmeter sind nicht verfügbar.',
  many_points_dropped: 'Viele ungenaue GPS-Punkte wurden verworfen.',
  large_gaps: 'Lange Lücken ohne GPS-Signal.',
};
const kindLabel = {
  lift: 'Lift',
  run: 'Abfahrt',
  flat: 'Flach',
  pause: 'Pause',
} as const;
const qualityLabel = {
  high: 'hoch',
  medium: 'mittel',
  low: 'niedrig',
} as const;
const km = (meters: number) => `${(meters / 1000).toFixed(1)} km`;
const time = (ms: number) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: tripConfig.timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));

export function TrackDetailPage() {
  const { trackId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const track = useQuery({
    queryKey: ['gps', 'track', trackId],
    queryFn: () => loadTrack(trackId),
    retry: false,
  });
  // Analysis runs on the device; thresholds are experimental (see docs/gps-tracking.md).
  const analysis = useMemo(
    () => (track.data ? analyzeTrack(track.data.points) : null),
    [track.data],
  );

  const remote = useQuery({
    queryKey: ['private', 'gps-tracks'],
    queryFn: () => api('/gps-tracks', gpsTracksResponseSchema),
    retry: false,
  });
  const stored = remote.data?.tracks.find((t) => t.clientTrackId === trackId);
  const upload = useMutation({
    mutationFn: async () => {
      const { meta, points } = track.data!;
      const bytes = await compressTrack(points);
      return api(`/gps-tracks/${trackId}`, gpsTrackSummarySchema, 'PUT', {
        startedAt: meta.startedAt,
        endedAt: meta.endedAt ?? points[points.length - 1].t,
        pointCount: points.length,
        altRef: meta.altRef ?? null,
        algorithmVersion: analysis!.algorithmVersion,
        stats: uploadStats(analysis!.stats),
        data: bytesToBase64(bytes),
      });
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['private', 'gps-tracks'] }),
  });
  const removeRemote = useMutation({
    mutationFn: () =>
      api(
        `/gps-tracks/${stored!.id}`,
        z.object({ deleted: z.boolean() }),
        'DELETE',
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['private', 'gps-tracks'] }),
  });
  const uploadError = [upload.error, removeRemote.error].find(Boolean);
  const loggedOut =
    uploadError instanceof ApiError && uploadError.status === 401;

  if (track.isPending)
    return (
      <p className="route-loading" role="status">
        Aufzeichnung wird geladen …
      </p>
    );
  if (track.error || !track.data || !analysis)
    return (
      <section className="shell">
        <p className="auth-error" role="alert">
          Diese Aufzeichnung konnte nicht gelesen werden.
        </p>
        <Link className="text-action" to="/skitage">
          Zurück zu den Aufzeichnungen
        </Link>
      </section>
    );
  const { stats } = analysis;
  const tiles: Array<[string, string, string?]> = [
    [
      'Höhenmeter (Lifte)',
      `${Math.round(stats.liftAscentM)} m`,
      `${stats.liftCount} Lifte`,
    ],
    [
      'Abfahrten',
      String(stats.runCount),
      `${Math.round(stats.runDescentM)} m bergab`,
    ],
    ['Strecke', km(stats.distanceM), `Abfahrt ${km(stats.runDistanceM)}`],
    ['Höchsttempo', `${Math.round(stats.maxSpeedMs * 3.6)} km/h`, undefined],
    [
      'Dauer',
      formatDuration(stats.durationS),
      `in Bewegung ${formatDuration(stats.movingS)}`,
    ],
  ];
  return (
    <section className="shell track-detail">
      <div className="track-detail__head">
        <h2>
          {track.data.meta.endedAt
            ? `${time(track.data.meta.startedAt)}–${time(track.data.meta.endedAt)} Uhr`
            : 'Aufzeichnung'}
        </h2>
        <StatusBadge tone="info">GPS · berechnet</StatusBadge>
        <StatusBadge tone={stats.quality === 'low' ? 'warning' : 'muted'}>
          Qualität {qualityLabel[stats.quality]}
        </StatusBadge>
      </div>
      {track.data.meta.state === 'interrupted' && (
        <p className="auth-notice" role="status">
          Diese Aufzeichnung wurde unterbrochen. Die bis dahin gespeicherten
          Punkte sind erhalten.
        </p>
      )}
      {analysis.warnings.map((w) => (
        <p key={w} className="auth-notice" role="status">
          {warningText[w] ?? w}
        </p>
      ))}
      <div className="kpi-row track-kpis">
        {tiles.map(([label, value, sub]) => (
          <div className="kpi" key={label}>
            <span className="kpi-label">{label}</span>
            <strong className="kpi-value">{value}</strong>
            {sub && <span className="kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>
      <TrackMap points={analysis.points} segments={analysis.segments} />
      <details className="dashboard-status">
        <summary className="dashboard-status__summary">
          <span>Abschnitte ({analysis.segments.length})</span>
        </summary>
        <ol className="track-segments">
          {analysis.segments.map((s) => (
            <li key={s.startIndex}>
              <strong>{kindLabel[s.kind]}</strong>
              <span>
                {time(s.startT)} · {formatDuration(s.durationS)}
              </span>
              <span>
                {s.kind === 'pause'
                  ? ''
                  : `${km(s.distanceM)} · ${
                      s.kind === 'lift'
                        ? `+${Math.round(s.ascentM)} m`
                        : s.kind === 'run'
                          ? `−${Math.round(s.descentM)} m`
                          : ''
                    }`}
              </span>
            </li>
          ))}
        </ol>
        <small>
          Lifte, Abfahrten und Höhenmeter werden aus GPS und Luftdruck berechnet
          und können von offiziellen Skiline-Werten abweichen. Die Auswertung
          ist experimentell.
        </small>
      </details>
      <section className="gps-upload" aria-labelledby="gps-upload-title">
        <h3 id="gps-upload-title">Sicherung auf dem Server</h3>
        <p>
          {stored
            ? 'Diese Aufzeichnung ist gesichert. Sie ist nur für dich sichtbar; mit der Gruppe wird nichts geteilt.'
            : 'Optional: Sichere die Aufzeichnung auf dem Server (verschlüsselte Übertragung, ca. 50–100 KB). Sie ist nur für dich sichtbar; mit der Gruppe wird nichts geteilt.'}
        </p>
        <div className="auth-actions">
          {!stored ? (
            <Button
              variant="primary"
              static
              busy={upload.isPending}
              disabled={track.data.points.length < 2}
              onClick={() => upload.mutate()}
            >
              {upload.isPending
                ? 'Wird hochgeladen …'
                : 'Auf dem Server sichern'}
            </Button>
          ) : (
            <>
              <StatusBadge tone="success">Gesichert</StatusBadge>
              <Button
                variant="text"
                busy={removeRemote.isPending}
                onClick={() => removeRemote.mutate()}
              >
                Server-Kopie löschen
              </Button>
            </>
          )}
        </div>
        {uploadError && (
          <p className="auth-error" role="alert">
            {loggedOut
              ? 'Bitte melde dich zuerst im Profil an.'
              : uploadError instanceof Error
                ? uploadError.message
                : 'Das hat nicht geklappt.'}
          </p>
        )}
      </section>
      <div className="auth-actions">
        {!confirmDelete ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Aufzeichnung löschen
          </Button>
        ) : (
          <>
            <Button
              variant="danger"
              static
              onClick={() => {
                void gps.deleteTrack({ id: trackId }).then(
                  async () => {
                    await client.invalidateQueries({ queryKey: ['gps'] });
                    void navigate('/skitage', { replace: true });
                  },
                  () => setError('Löschen fehlgeschlagen.'),
                );
              }}
            >
              Ja, endgültig löschen
            </Button>
            <Button variant="text" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
          </>
        )}
      </div>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
