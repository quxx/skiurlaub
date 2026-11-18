import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  analyzeTrack,
  bytesToBase64,
  compressTrack,
  matchLifts,
  matchPistes,
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
import { ElevationChart } from '@/components/track/ElevationChart';
import {
  ResortDataProvider,
  useResortData,
} from '@/components/resort/ResortDataProvider';
import type { TrackOverlay } from '@/components/resort/LiftMiniMap';
import { liftRefs, liftTypeLabel } from '@/data/resort/lift-labels';
import { loadZillertalArenaPistes } from '@/data/resort/liftradar-pistes';
import type { PisteStretch } from '@skiurlaub/gps';
import { gps, loadTrack } from '@/data/gps-client';

const warningText: Record<string, string> = {
  too_few_points: 'Zu wenige Punkte für eine Auswertung.',
  no_altitude: 'Keine Höhendaten: Höhenmeter sind nicht verfügbar.',
  many_points_dropped: 'Viele ungenaue GPS-Punkte wurden verworfen.',
  large_gaps: 'Lange Lücken ohne GPS-Signal.',
};
const difficultyWord: Record<string, string> = {
  novice: 'Übungspiste',
  easy: 'blau',
  intermediate: 'rot',
  advanced: 'schwarz',
};
function stretchLabel(stretch: PisteStretch) {
  if (!stretch.pisteId) return 'abseits bekannter Pisten';
  const base =
    stretch.ref && stretch.name
      ? `Piste ${stretch.ref} · ${stretch.name}`
      : stretch.ref
        ? `Piste ${stretch.ref}`
        : (stretch.name ?? 'Piste');
  const color = stretch.difficulty ? difficultyWord[stretch.difficulty] : null;
  return color ? `${base} (${color})` : base;
}

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

const LiftMiniMap = lazy(() =>
  import('@/components/resort/LiftMiniMap').then((module) => ({
    default: module.LiftMiniMap,
  })),
);

// The recorded route on top of the resort map (lifts, pistes, webcams).
function SkiMap({ track }: { track: TrackOverlay }) {
  const { resource } = useResortData();
  const resort = resource.data?.data;
  return (
    <Suspense
      fallback={
        <p className="route-loading" role="status">
          Karte wird geladen …
        </p>
      }
    >
      <LiftMiniMap
        lifts={resort?.liftItems ?? []}
        pisteStatuses={resort?.pisteItems ?? []}
        webcams={resort?.webcams ?? []}
        track={track}
        compact
      />
    </Suspense>
  );
}

export function TrackDetailPage() {
  const { trackId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
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
  // Lifts are matched against known terminals (OSM, ODbL). Pistes use the LiftRadar tiles
  // the map already loads (shared request); the usage right is documented as unresolved.
  const matches = useMemo(
    () =>
      analysis ? matchLifts(analysis.points, analysis.segments, liftRefs) : [],
    [analysis],
  );
  const pistes = useQuery({
    queryKey: ['dashboard', 'pistes'],
    queryFn: () => loadZillertalArenaPistes(),
    staleTime: Infinity,
    retry: false,
  });
  const pisteMatches = useMemo(
    () =>
      analysis && pistes.data
        ? matchPistes(
            analysis.points,
            analysis.segments,
            pistes.data.filter((piste) => !piste.isArea),
          )
        : [],
    [analysis, pistes.data],
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
      {analysis.altitudeSource !== 'none' && analysis.segments.length > 0 && (
        <ElevationChart
          points={analysis.points}
          segments={analysis.segments}
          selected={selected}
          onSelect={setSelected}
        />
      )}
      {analysis.points.length >= 2 && (
        <ResortDataProvider>
          <SkiMap
            track={{
              points: analysis.points,
              segments: analysis.segments,
              selected,
            }}
          />
        </ResortDataProvider>
      )}
      <ol className="track-timeline" aria-label="Abschnitte">
        {analysis.segments.map((s, i) => {
          const match = matches[i];
          // Position among segments of the same kind (Lift 2, Abfahrt 3 ...).
          const nth = analysis.segments
            .slice(0, i + 1)
            .filter((x) => x.kind === s.kind).length;
          const title =
            s.kind === 'lift'
              ? (match?.name ??
                (match ? liftTypeLabel[match.type] : null) ??
                `Lift ${nth}`)
              : s.kind === 'run'
                ? `Abfahrt ${nth}`
                : kindLabel[s.kind];
          const detail =
            s.kind === 'lift'
              ? `+${Math.round(s.ascentM)} m · ${km(s.distanceM)}`
              : s.kind === 'run'
                ? `−${Math.round(s.descentM)} m · ${km(s.distanceM)}`
                : s.kind === 'flat'
                  ? km(s.distanceM)
                  : '';
          return (
            <li key={s.startIndex}>
              <button
                type="button"
                data-kind={s.kind}
                aria-pressed={selected === i}
                onClick={() => setSelected(selected === i ? null : i)}
              >
                <span className="track-timeline__dot" aria-hidden="true" />
                <span className="track-timeline__title">
                  <strong>{title}</strong>
                  {match?.confidence === 'medium' && (
                    <small>
                      wahrscheinlich
                      {match.alternatives.length
                        ? ` · oder ${match.alternatives.slice(0, 2).join(', ')}`
                        : ''}
                    </small>
                  )}
                  {s.kind === 'lift' && !match && (
                    <small>keinem bekannten Lift zugeordnet</small>
                  )}
                  {s.kind === 'run' &&
                    pisteMatches[i]?.map((stretch) => (
                      <small key={stretch.startIndex}>
                        {stretchLabel(stretch)}
                        {stretch.confidence === 'medium'
                          ? ` · wahrscheinlich${stretch.alternatives.length ? `, oder ${stretch.alternatives.slice(0, 2).join(', ')}` : ''}`
                          : ''}
                      </small>
                    ))}
                  {s.kind === 'run' && pistes.isError && (
                    <small>Pisten konnten nicht geladen werden</small>
                  )}
                </span>
                <span className="track-timeline__meta">
                  {time(s.startT)} · {formatDuration(s.durationS)}
                  {detail && <br />}
                  {detail}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="track-note">
        Lifte und Pisten werden anhand von Kartendaten zugeordnet (OpenSkiData,
        © OpenStreetMap-Mitwirkende, über LiftRadar); bei dicht
        beieinanderliegenden Pisten ist die Zuordnung unsicher. Alle Werte
        stammen aus GPS und Luftdruck, sind experimentell und können von
        offiziellen Skiline-Werten abweichen.
      </p>
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
