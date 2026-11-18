import {
  statusFor,
  createPisteStatusIndex,
  pisteStatusForRef,
  pisteStatusFor,
  displayName,
  createLiftStatusIndex,
} from '@/data/resort/status-matching';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CableCar,
  Camera,
  Eye,
  ExternalLink,
  MapPin,
  Route,
  Waypoints,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalyzedPoint, Segment } from '@skiurlaub/gps';

import {
  arenaTourFromHochkrimml,
  arenaTourLiftIds,
  arenaTourUrl,
  isArenaTourPiste,
} from '@/data/resort/arena-tour';
import { loadZillertalArenaPistes } from '@/data/resort/liftradar-pistes';
import type {
  PisteDifficulty,
  PisteGeometry,
} from '@/data/resort/liftradar-pistes';
import { zillertalArenaLifts } from '@/data/resort/zillertal-arena-lifts';
import type { GeographicLift } from '@/data/resort/zillertal-arena-lifts';
import type {
  LiftOperationalStatus,
  LiftStatus,
  PisteStatus,
  ResortWebcam,
} from '@/types/resort';

// A recorded GPS track drawn over the resort map (optional).
export type TrackOverlay = {
  points: AnalyzedPoint[];
  segments: Segment[];
  selected: number | null;
};
type LiftMiniMapProps = {
  lifts: LiftStatus[];
  pisteStatuses: PisteStatus[];
  webcams: ResortWebcam[];
  track?: TrackOverlay;
  /** Smaller map without tour overview and links (used inside other pages). */
  compact?: boolean;
};

const trackColors: Record<Segment['kind'], string> = {
  lift: '#f59e0b',
  run: '#22d3ee',
  flat: '#94a3b8',
  pause: '#64748b',
};

const mapBounds = L.latLngBounds([47.192, 11.885], [47.272, 12.165]);

const statusView: Record<
  LiftOperationalStatus,
  { color: string; label: string }
> = {
  open: { color: '#20c997', label: 'Geöffnet' },
  closed: { color: '#f43f5e', label: 'Geschlossen' },
  hold: { color: '#f59e0b', label: 'Angehalten' },
  scheduled: { color: '#3b82f6', label: 'Geplant' },
  unknown: { color: '#64748b', label: 'Nicht gemeldet' },
};

const pisteView: Record<PisteDifficulty, { color: string; label: string }> = {
  novice: { color: '#38bdf8', label: 'Übungspiste' },
  easy: { color: '#38bdf8', label: 'Leicht' },
  intermediate: { color: '#fb4e61', label: 'Mittel' },
  advanced: { color: '#111827', label: 'Schwer' },
  unknown: { color: '#f8fafc', label: 'Ohne Einstufung' },
};

export function LiftMiniMap({
  lifts,
  pisteStatuses,
  webcams,
  track,
  compact = false,
}: LiftMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const liftLayerRef = useRef<L.LayerGroup | null>(null);
  const pisteLayerRef = useRef<L.LayerGroup | null>(null);
  const webcamLayerRef = useRef<L.LayerGroup | null>(null);
  const trackLayerRef = useRef<L.LayerGroup | null>(null);
  const fittedTrackRef = useRef<AnalyzedPoint[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pistes, setPistes] = useState<PisteGeometry[]>([]);
  const [pisteLoadState, setPisteLoadState] = useState<
    'loading' | 'success' | 'error'
  >('loading');
  const [showPistes, setShowPistes] = useState(true);
  const [showLifts, setShowLifts] = useState(true);
  // The embedded track map shows only lifts and pistes: no webcams, no Arena Tour.
  const [showWebcams, setShowWebcams] = useState(!compact);
  const [arenaTourOnly, setArenaTourOnly] = useState(false);
  const [selectedPisteId, setSelectedPisteId] = useState<string | null>(null);
  const statuses = useMemo(() => createLiftStatusIndex(lifts), [lifts]);
  const pisteStatusIndex = useMemo(
    () => createPisteStatusIndex(pisteStatuses),
    [pisteStatuses],
  );
  const selected =
    zillertalArenaLifts.find((lift) => lift.id === selectedId) ?? null;
  const selectedStatus = selected ? statusFor(selected, statuses) : 'unknown';
  const selectedPiste =
    pistes.find((piste) => piste.id === selectedPisteId) ?? null;
  const selectedPisteReport = selectedPiste
    ? pisteStatusFor(selectedPiste, pisteStatusIndex)
    : null;
  const selectedPisteStatus = selectedPisteReport?.status ?? 'unknown';

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      attributionControl: true,
      maxBounds: mapBounds.pad(4),
      minZoom: 10,
      scrollWheelZoom: false,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    // LiftRadar asks for credit for the map tile data (OpenSkiData, OpenStreetMap, ODbL).
    map.attributionControl.addAttribution(
      'Pisten &amp; Lifte: <a href="https://liftradar.eu/de/api">LiftRadar</a>, OpenSkiData',
    );

    const pistePane = map.createPane('pistes');
    pistePane.style.zIndex = '390';
    const webcamPane = map.createPane('webcams');
    webcamPane.style.zIndex = '450';
    const trackPane = map.createPane('track');
    trackPane.style.zIndex = '440';
    trackLayerRef.current = L.layerGroup().addTo(map);
    pisteLayerRef.current = L.layerGroup().addTo(map);
    liftLayerRef.current = L.layerGroup().addTo(map);
    webcamLayerRef.current = L.layerGroup().addTo(map);
    map.fitBounds(mapBounds, { padding: [18, 18] });
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      liftLayerRef.current = null;
      pisteLayerRef.current = null;
      webcamLayerRef.current = null;
      trackLayerRef.current = null;
      fittedTrackRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPisteLoadState('loading');
    void loadZillertalArenaPistes(controller.signal).then(
      (data) => {
        setPistes(data);
        setPisteLoadState('success');
      },
      () => {
        if (!controller.signal.aborted) setPisteLoadState('error');
      },
    );
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const group = liftLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!showLifts) return;

    const visibleLifts = arenaTourOnly
      ? zillertalArenaLifts.filter((lift) => arenaTourLiftIds.has(lift.id))
      : zillertalArenaLifts;

    visibleLifts.forEach((lift) => {
      const status = statusFor(lift, statuses);
      const presentation = statusView[status];
      const points = lift.points.map(([lon, lat]) => L.latLng(lat, lon));
      const isSelected = lift.id === selectedId;
      const label = displayName(lift);

      L.polyline(points, {
        color: '#07111a',
        interactive: false,
        opacity: 0.9,
        weight: isSelected ? 12 : 8,
      }).addTo(group);

      const line = L.polyline(points, {
        color: presentation.color,
        opacity: status === 'unknown' ? 0.82 : 1,
        weight: isSelected ? 7 : lift.type === 'magic_carpet' ? 4 : 5,
      });
      line.bindTooltip(
        `<strong>${escapeHtml(label)}</strong><br>${presentation.label}`,
        {
          className: 'lift-map-tooltip',
          direction: 'top',
          sticky: true,
        },
      );
      line.on('click', () => {
        setSelectedId((value) => (value === lift.id ? null : lift.id));
        setSelectedPisteId(null);
      });
      line.addTo(group);

      for (const point of [points[0], points.at(-1)]) {
        if (!point) continue;
        L.circleMarker(point, {
          color: '#07111a',
          fillColor: presentation.color,
          fillOpacity: 1,
          interactive: false,
          radius: isSelected ? 5 : 3,
          weight: 2,
        }).addTo(group);
      }
    });
  }, [arenaTourOnly, selectedId, showLifts, statuses]);

  useEffect(() => {
    const group = pisteLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!showPistes) return;

    const visiblePistes = arenaTourOnly
      ? pistes.filter(isArenaTourPiste)
      : pistes;

    visiblePistes.forEach((piste) => {
      const presentation = pisteView[piste.difficulty];
      const report = pisteStatusFor(piste, pisteStatusIndex);
      const operationalStatus = report?.status ?? 'unknown';
      const statusPresentation = statusView[operationalStatus];
      const isSelected = piste.id === selectedPisteId;
      const outlineColor =
        operationalStatus === 'open'
          ? statusPresentation.color
          : piste.difficulty === 'advanced'
            ? '#f8fafc'
            : '#07111a';
      const dashArray =
        operationalStatus === 'closed'
          ? '5 6'
          : operationalStatus === 'hold' || operationalStatus === 'scheduled'
            ? '9 4'
            : undefined;
      const pisteOpacity =
        operationalStatus === 'closed'
          ? 0.46
          : operationalStatus === 'unknown'
            ? 0.72
            : 0.98;

      if (piste.isArea) {
        const area = L.polygon(piste.paths, {
          pane: 'pistes',
          color: presentation.color,
          fillColor: presentation.color,
          fillOpacity:
            operationalStatus === 'closed'
              ? 0.08
              : piste.difficulty === 'advanced'
                ? 0.28
                : 0.2,
          dashArray,
          opacity: pisteOpacity,
          weight: isSelected ? 4 : 2,
        });
        area.on('click', () => {
          setSelectedPisteId((value) => (value === piste.id ? null : piste.id));
          setSelectedId(null);
        });
        area.addTo(group);
        return;
      }

      L.polyline(piste.paths[0] ?? [], {
        pane: 'pistes',
        color: outlineColor,
        interactive: false,
        opacity:
          operationalStatus === 'open'
            ? 0.94
            : piste.difficulty === 'advanced'
              ? 0.65
              : 0.72,
        weight: isSelected ? 8 : operationalStatus === 'open' ? 6 : 5,
      }).addTo(group);
      const line = L.polyline(piste.paths[0] ?? [], {
        pane: 'pistes',
        color: presentation.color,
        dashArray,
        opacity: pisteOpacity,
        weight: isSelected ? 4 : 2.5,
      });
      line.on('click', () => {
        setSelectedPisteId((value) => (value === piste.id ? null : piste.id));
        setSelectedId(null);
      });
      line.addTo(group);
    });
  }, [arenaTourOnly, pisteStatusIndex, pistes, selectedPisteId, showPistes]);

  useEffect(() => {
    const group = trackLayerRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    if (!track || track.points.length < 2) return;
    const bounds = L.latLngBounds([]);
    track.segments.forEach((segment, index) => {
      const latlngs = track.points
        .slice(segment.startIndex, segment.endIndex + 1)
        .map((point) => [point.lat, point.lon] as [number, number]);
      if (latlngs.length < 2) return;
      bounds.extend(latlngs);
      const chosen = track.selected === index;
      const dimmed = track.selected !== null && !chosen;
      // White casing keeps the route readable on top of coloured pistes and lifts.
      L.polyline(latlngs, {
        pane: 'track',
        color: '#ffffff',
        weight: chosen ? 9 : 6,
        opacity: dimmed ? 0.35 : 0.9,
        interactive: false,
      }).addTo(group);
      L.polyline(latlngs, {
        pane: 'track',
        color: trackColors[segment.kind],
        weight: chosen ? 6 : 3.5,
        opacity: dimmed ? 0.5 : 1,
        dashArray: segment.kind === 'pause' ? '2 6' : undefined,
        interactive: false,
      }).addTo(group);
    });
    // Fit once per recording, not on every selection change.
    if (fittedTrackRef.current !== track.points && bounds.isValid()) {
      fittedTrackRef.current = track.points;
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
    }
  }, [track]);

  useEffect(() => {
    const group = webcamLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!showWebcams || arenaTourOnly) return;

    webcams.forEach((webcam) => {
      const imageUrl = safeExternalUrl(webcam.imageUrl);
      const playerUrl = safeExternalUrl(webcam.playerUrl);
      const sourceUrl = safeExternalUrl(webcam.sourceUrl);
      const destinationUrl = playerUrl ?? sourceUrl;
      const preview = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="Livecam-Vorschau ${escapeHtml(webcam.name)}" loading="lazy">`
        : '';
      const link = destinationUrl
        ? `<a class="webcam-popup__action" href="${escapeHtml(destinationUrl)}" target="_blank" rel="noreferrer">Livecam öffnen<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg></a>`
        : '';
      const icon = L.divIcon({
        className: 'webcam-map-marker',
        html: `<span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z"/><circle cx="12" cy="13" r="3.25"/></svg></span>`,
        iconAnchor: [16, 32],
        iconSize: [32, 32],
        popupAnchor: [0, -34],
      });
      const marker = L.marker([webcam.latitude, webcam.longitude], {
        icon,
        pane: 'webcams',
        title: webcam.name,
      });
      marker.bindTooltip(escapeHtml(webcam.name), {
        className: 'lift-map-tooltip',
        direction: 'top',
        offset: [0, -28],
      });
      marker.bindPopup(
        `<article class="webcam-popup"><div class="webcam-popup__media">${preview}</div><div class="webcam-popup__body"><strong>${escapeHtml(webcam.name)}</strong>${link}</div></article>`,
        {
          autoPan: true,
          autoPanPaddingBottomRight: L.point(16, 72),
          autoPanPaddingTopLeft: L.point(16, 16),
          className: 'webcam-map-popup',
          closeButton: true,
          keepInView: true,
          maxWidth: 300,
          minWidth: 240,
        },
      );
      marker.on('popupopen', () => marker.closeTooltip());
      marker.addTo(group);
    });
  }, [arenaTourOnly, showWebcams, webcams]);

  return (
    <div className="map-view">
      <div className="map-surface relative overflow-hidden rounded-2xl border border-white/10 bg-[#071522]">
        <div
          className={`lift-leaflet-map h-[32rem] w-full sm:h-[38rem]${compact ? ' track-map' : ''}`}
          ref={containerRef}
          aria-label={
            arenaTourOnly
              ? 'Arena-Tour-Karte mit den benötigten Liften und Pisten'
              : 'Interaktive Karte der Zillertal Arena mit Liften, Pisten und Livecams'
          }
        />

        <details className="map-legend">
          <summary>Legende</summary>
          <div className="map-legend__body">
            {showLifts ? (
              <div className="map-legend__group">
                <Legend status="open" />
                <Legend status="closed" />
                <Legend status="hold" />
                <Legend status="unknown" />
              </div>
            ) : null}
            {showPistes ? (
              <div className="map-legend__group">
                <PisteLegend difficulty="easy" />
                <PisteLegend difficulty="intermediate" />
                <PisteLegend difficulty="advanced" />
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-0.5 w-3 bg-ice-50/70" />
                  offen
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-0.5 w-3 border-t border-dashed border-ice-50/70" />
                  geschlossen
                </span>
              </div>
            ) : null}
          </div>
        </details>

        <div
          className="map-layer-controls absolute top-3 right-3 z-[500] flex max-w-[calc(100%_-_4.5rem)] flex-wrap justify-end gap-1.5 rounded-xl border border-white/10 bg-midnight-950/88 p-2 shadow-xl backdrop-blur-md"
          aria-label="Kartenebenen"
        >
          {!compact && (
            <button
              aria-pressed={arenaTourOnly}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition ${
                arenaTourOnly
                  ? 'border-amber-300/40 bg-amber-300/15 text-amber-200'
                  : 'border-white/10 bg-white/5 text-ice-200/70 hover:border-glacier-300/35 hover:bg-white/10 hover:text-ice-50'
              }`}
              onClick={() => {
                const nextValue = !arenaTourOnly;
                setArenaTourOnly(nextValue);
                setSelectedId(null);
                setSelectedPisteId(null);
                if (nextValue) {
                  setShowLifts(true);
                  setShowPistes(true);
                }
              }}
              type="button"
            >
              <Waypoints size={13} aria-hidden="true" />
              Arena Tour
            </button>
          )}
          <button
            aria-pressed={showLifts}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-ice-200/70 transition hover:border-glacier-300/35 hover:bg-white/10 hover:text-ice-50"
            onClick={() => {
              setShowLifts((value) => !value);
              setSelectedId(null);
            }}
            type="button"
          >
            <Eye size={16} strokeWidth={2} aria-hidden="true" />
            Lifte
          </button>
          <button
            aria-pressed={showPistes}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-ice-200/70 transition hover:border-glacier-300/35 hover:bg-white/10 hover:text-ice-50 disabled:cursor-wait disabled:opacity-50"
            disabled={pisteLoadState === 'loading'}
            onClick={() => {
              setShowPistes((value) => !value);
              setSelectedPisteId(null);
            }}
            type="button"
          >
            <Eye size={16} strokeWidth={2} aria-hidden="true" />
            {pisteLoadState === 'loading'
              ? 'Pisten werden geladen …'
              : pisteLoadState === 'error'
                ? 'Pisten nicht verfügbar'
                : 'Pisten'}
          </button>
          {webcams.length > 0 && !arenaTourOnly && !compact ? (
            <button
              aria-pressed={showWebcams}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-ice-200/70 transition hover:border-glacier-300/35 hover:bg-white/10 hover:text-ice-50"
              onClick={() => setShowWebcams((value) => !value)}
              type="button"
            >
              <Camera size={13} aria-hidden="true" />
              Livecams
            </button>
          ) : null}
        </div>

        {selected ? (
          <div className="pointer-events-none absolute right-3 bottom-8 left-3 z-[500] flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-midnight-950/94 p-3 shadow-2xl backdrop-blur sm:left-auto sm:min-w-72">
            <span className="grid size-9 place-items-center rounded-lg bg-white/5">
              <MapPin
                size={16}
                className="text-glacier-300"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-xs text-ice-50">
                {displayName(selected)}
              </strong>
              <span className="mt-1 block text-xs text-ice-200/45">
                {liftTypeName(selected.type)}
              </span>
            </div>
            <span
              className="inline-flex items-center gap-1.5 text-xs font-bold"
              style={{ color: statusView[selectedStatus].color }}
            >
              <i
                className="size-2 rounded-full"
                style={{ backgroundColor: statusView[selectedStatus].color }}
              />
              {statusView[selectedStatus].label}
            </span>
          </div>
        ) : null}

        {selectedPiste ? (
          <div className="pointer-events-none absolute right-3 bottom-8 left-3 z-[500] flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-midnight-950/94 p-3 shadow-2xl backdrop-blur sm:left-auto sm:min-w-80">
            <span className="grid size-9 place-items-center rounded-lg bg-white/5">
              <Route
                size={16}
                className="text-glacier-300"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-xs text-ice-50">
                {pisteLabel(selectedPiste)}
              </strong>
              <span className="mt-1 block text-xs text-ice-200/45">
                {pisteView[selectedPiste.difficulty].label}
                {selectedPisteReport?.kilometers !== null &&
                selectedPisteReport?.kilometers !== undefined
                  ? ` · ${selectedPisteReport.kilometers.toLocaleString('de-DE')} km`
                  : ''}
              </span>
            </div>
            <span
              className="inline-flex items-center gap-1.5 text-xs font-bold"
              style={{ color: statusView[selectedPisteStatus].color }}
            >
              <i
                className="size-2 rounded-full"
                style={{
                  backgroundColor: statusView[selectedPisteStatus].color,
                }}
              />
              {statusView[selectedPisteStatus].label}
            </span>
          </div>
        ) : null}
      </div>

      {arenaTourOnly && !compact ? (
        <ArenaTourOverview
          liftStatuses={statuses}
          pisteStatuses={pisteStatuses}
        />
      ) : null}

      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-ice-200/35"
        hidden={compact}
      >
        <a
          className="inline-flex items-center gap-1.5 text-glacier-200/75 transition hover:text-glacier-200"
          href="https://zillertal.intermaps.com/zillertalarena"
          target="_blank"
          rel="noreferrer"
        >
          Offizieller Pistenplan <ExternalLink size={11} aria-hidden="true" />
        </a>
        {arenaTourOnly ? (
          <a
            className="inline-flex items-center gap-1.5 text-amber-200/80 transition hover:text-amber-200"
            href={arenaTourUrl}
            target="_blank"
            rel="noreferrer"
          >
            Offizielle Arena Tour
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ArenaTourOverview({
  liftStatuses,
  pisteStatuses,
}: {
  liftStatuses: Map<string, LiftOperationalStatus>;
  pisteStatuses: PisteStatus[];
}) {
  return (
    <section className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.035] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold tracking-[0.14em] text-amber-200/70 uppercase">
            Arenatour 2 · Fahrtrichtung
          </p>
          <h3 className="mt-1 text-sm font-bold text-ice-50">
            Hochkrimml → Königsleiten → Gerlos → Zell
          </h3>
        </div>
      </div>

      <ol className="mt-4 grid gap-2 lg:grid-cols-2">
        {arenaTourFromHochkrimml.map((leg, legIndex) => (
          <li
            className="rounded-xl border border-white/7 bg-midnight-950/38 p-3"
            key={leg.area}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-amber-300/15 text-xs font-extrabold text-amber-200">
                {legIndex + 1}
              </span>
              <strong className="text-xs text-ice-50/85">{leg.area}</strong>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {leg.segments.map((segment, segmentIndex) => {
                const separator =
                  segmentIndex > 0 ? (
                    <span
                      className="text-xs text-ice-200/25"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  ) : null;

                if (segment.kind === 'lift') {
                  const lift = zillertalArenaLifts.find(
                    (item) => item.id === segment.liftId,
                  );
                  if (!lift) return null;
                  const status = statusFor(lift, liftStatuses);
                  return (
                    <span
                      className="contents"
                      key={`${leg.area}:${segmentIndex}`}
                    >
                      {separator}
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/4 px-2 py-1 text-xs font-semibold text-ice-200/75"
                        title={statusView[status].label}
                      >
                        <CableCar
                          className="text-glacier-300"
                          size={11}
                          aria-hidden="true"
                        />
                        {displayName(lift)}
                        <i
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: statusView[status].color }}
                        />
                      </span>
                    </span>
                  );
                }

                return (
                  <span
                    className="contents"
                    key={`${leg.area}:${segmentIndex}`}
                  >
                    {separator}
                    {segment.refs.map((ref) => {
                      const status = pisteStatusForRef(ref, pisteStatuses);
                      return (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/4 px-2 py-1 text-xs font-semibold text-ice-200/75"
                          key={`${leg.area}:${segmentIndex}:${ref}`}
                          title={statusView[status].label}
                        >
                          <Route
                            className="text-turquoise-300"
                            size={10}
                            aria-hidden="true"
                          />
                          Piste {ref}
                          <i
                            className="size-1.5 rounded-full"
                            style={{
                              backgroundColor: statusView[status].color,
                            }}
                          />
                        </span>
                      );
                    })}
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function liftTypeName(type: GeographicLift['type']) {
  const names: Record<GeographicLift['type'], string> = {
    cable_car: 'Seilbahn',
    chair_lift: 'Sessellift',
    gondola: 'Gondelbahn',
    magic_carpet: 'Förderband',
    platter: 'Tellerlift',
    rope_tow: 'Seillift',
    't-bar': 'Schlepplift',
  };
  return names[type];
}

function Legend({ status }: { status: LiftOperationalStatus }) {
  const item = statusView[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <i
        className="size-2 rounded-full"
        style={{ backgroundColor: item.color }}
      />
      {item.label}
    </span>
  );
}

function PisteLegend({ difficulty }: { difficulty: PisteDifficulty }) {
  const item = pisteView[difficulty];
  return (
    <span className="inline-flex items-center gap-1.5">
      <i
        className="h-0.5 w-3 rounded-full"
        style={{ backgroundColor: item.color }}
      />
      {item.label}
    </span>
  );
}

function pisteLabel(piste: PisteGeometry) {
  if (piste.ref && piste.name && piste.name !== piste.ref)
    return `Piste ${piste.ref} · ${piste.name}`;
  if (piste.ref || piste.name) return `Piste ${piste.ref ?? piste.name}`;
  return 'Piste ohne Bezeichnung';
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[
        character
      ] ?? character,
  );
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
