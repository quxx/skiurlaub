import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { AnalyzedPoint, Segment, SegmentKind } from '@skiurlaub/gps';

const colors: Record<SegmentKind, string> = {
  lift: '#f59e0b',
  run: '#22d3ee',
  flat: '#94a3b8',
  pause: '#64748b',
};

// Recorded route on an OSM base map, coloured by segment type. The public OSM
// tile servers are fine for this light, on-demand use (no prefetching).
export function TrackMap({
  points,
  segments,
}: {
  points: AnalyzedPoint[];
  segments: Segment[];
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current || points.length < 2) return;
    const map = L.map(container.current, {
      attributionControl: true,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    const all = L.latLngBounds([]);
    const draw = (from: number, to: number, kind: SegmentKind) => {
      const latlngs = points
        .slice(from, to + 1)
        .map((p) => [p.lat, p.lon] as [number, number]);
      if (latlngs.length < 2) return;
      L.polyline(latlngs, {
        color: colors[kind],
        weight: kind === 'pause' ? 3 : 4,
        opacity: kind === 'pause' ? 0.5 : 0.95,
        dashArray: kind === 'pause' ? '2 6' : undefined,
      }).addTo(map);
      all.extend(latlngs);
    };
    if (segments.length)
      for (const s of segments) draw(s.startIndex, s.endIndex, s.kind);
    else draw(0, points.length - 1, 'flat');
    const first = points[0];
    const last = points[points.length - 1];
    L.circleMarker([first.lat, first.lon], {
      radius: 6,
      color: '#fff',
      weight: 2,
      fillColor: '#22c55e',
      fillOpacity: 1,
    }).addTo(map);
    L.circleMarker([last.lat, last.lon], {
      radius: 6,
      color: '#fff',
      weight: 2,
      fillColor: '#ef4444',
      fillOpacity: 1,
    }).addTo(map);
    map.fitBounds(all, { padding: [24, 24] });
    return () => {
      map.remove();
    };
  }, [points, segments]);
  return (
    <div
      className="lift-leaflet-map track-map"
      ref={container}
      role="img"
      aria-label="Karte der aufgezeichneten Route"
    />
  );
}
