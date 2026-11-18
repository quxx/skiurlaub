import { useMemo, useState } from 'react';
import type { AnalyzedPoint, Segment, SegmentKind } from '@skiurlaub/gps';
import { tripConfig } from '@/app/trip-config';

const W = 360;
const H = 176;
const M = { left: 44, right: 10, top: 10, bottom: 24 };
const colors: Record<SegmentKind, string> = {
  lift: '#f59e0b',
  run: '#22d3ee',
  flat: '#94a3b8',
  pause: '#64748b',
};
const kindLabel: Record<SegmentKind, string> = {
  lift: 'Lift',
  run: 'Abfahrt',
  flat: 'Flach',
  pause: 'Pause',
};
const clock = (ms: number) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: tripConfig.timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));

// Altitude over time, coloured by segment type (lift / run / flat / pause).
// Tapping or dragging selects the segment under the finger; the same selection
// highlights the route on the map and in the list.
export function ElevationChart({
  points,
  segments,
  selected,
  onSelect,
}: {
  points: AnalyzedPoint[];
  segments: Segment[];
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const [cursor, setCursor] = useState<number | null>(null);
  const model = useMemo(() => {
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
      lo = Math.min(lo, p.alt);
      hi = Math.max(hi, p.alt);
    }
    const span = Math.max(hi - lo, 20);
    const yMin = lo - span * 0.08;
    const yMax = hi + span * 0.08;
    const x = (t: number) =>
      M.left + ((t - t0) / Math.max(1, t1 - t0)) * (W - M.left - M.right);
    const y = (alt: number) =>
      M.top + (1 - (alt - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);
    const rawStep = (yMax - yMin) / 3;
    const nice =
      [10, 25, 50, 100, 200, 250, 500].find((v) => v >= rawStep) ?? 500;
    const yTicks: number[] = [];
    for (let v = Math.ceil(yMin / nice) * nice; v <= yMax; v += nice)
      yTicks.push(v);
    const hours = (t1 - t0) / 3_600_000;
    const stepMinutes =
      hours > 5 ? 120 : hours > 2 ? 60 : hours > 1 ? 30 : hours > 0.4 ? 15 : 5;
    const stepMs = stepMinutes * 60_000;
    const xTicks: number[] = [];
    for (let t = Math.ceil(t0 / stepMs) * stepMs; t <= t1; t += stepMs)
      xTicks.push(t);
    const paths = segments.map((segment) => {
      const slice = points.slice(segment.startIndex, segment.endIndex + 1);
      const stride = Math.max(1, Math.ceil(slice.length / 160));
      const sampled = slice.filter(
        (_, i) => i % stride === 0 || i === slice.length - 1,
      );
      const line = sampled
        .map(
          (p, i) =>
            `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.alt).toFixed(1)}`,
        )
        .join('');
      const base = (H - M.bottom).toFixed(1);
      const area = `${line}L${x(sampled[sampled.length - 1].t).toFixed(1)} ${base}L${x(sampled[0].t).toFixed(1)} ${base}Z`;
      return { line, area };
    });
    return { t0, t1, x, y, yTicks, xTicks, paths };
  }, [points, segments]);

  const segmentAt = (index: number) =>
    segments.findIndex((s) => index >= s.startIndex && index < s.endIndex);
  const indexAt = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left) / rect.width;
    const t =
      model.t0 +
      ((ratio * W - M.left) / (W - M.left - M.right)) * (model.t1 - model.t0);
    let best = 0;
    for (let i = 0; i < points.length; i++)
      if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
    return best;
  };
  const choose = (event: React.PointerEvent<SVGSVGElement>) => {
    const index = indexAt(
      event.clientX,
      event.currentTarget.getBoundingClientRect(),
    );
    setCursor(index);
    const segment = segmentAt(index);
    onSelect(segment >= 0 ? segment : null);
  };
  const cursorPoint = cursor != null ? points[cursor] : null;
  const cursorSegment = cursor != null ? segmentAt(cursor) : -1;

  return (
    <figure className="elevation">
      <figcaption>
        {cursorPoint
          ? `${clock(cursorPoint.t)} · ${Math.round(cursorPoint.alt)} m${cursorSegment >= 0 ? ` · ${kindLabel[segments[cursorSegment].kind]}` : ''}`
          : 'Höhenprofil – tippe oder ziehe, um einen Abschnitt zu wählen'}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Höhenprofil der Aufzeichnung. Die Abschnitte stehen darunter als Liste."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          choose(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'touch') choose(e);
        }}
      >
        {model.yTicks.map((v) => (
          <g key={v}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={model.y(v)}
              y2={model.y(v)}
              className="elevation-grid"
            />
            <text x={M.left - 6} y={model.y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {model.xTicks.map((t) => (
          <text key={t} x={model.x(t)} y={H - 6} textAnchor="middle">
            {clock(t)}
          </text>
        ))}
        {segments.map((segment, i) => {
          const dimmed = selected !== null && selected !== i;
          const color = colors[segment.kind];
          return (
            <g key={segment.startIndex} opacity={dimmed ? 0.35 : 1}>
              {segment.kind !== 'pause' && (
                <path d={model.paths[i].area} fill={color} opacity={0.16} />
              )}
              <path
                d={model.paths[i].line}
                fill="none"
                stroke={color}
                strokeWidth={selected === i ? 3.5 : 2.2}
                strokeLinejoin="round"
                strokeDasharray={segment.kind === 'pause' ? '2 4' : undefined}
              />
            </g>
          );
        })}
        {cursorPoint && (
          <g>
            <line
              x1={model.x(cursorPoint.t)}
              x2={model.x(cursorPoint.t)}
              y1={M.top}
              y2={H - M.bottom}
              className="elevation-cursor"
            />
            <circle
              cx={model.x(cursorPoint.t)}
              cy={model.y(cursorPoint.alt)}
              r={4}
              className="elevation-dot"
            />
          </g>
        )}
      </svg>
      <ul className="elevation-legend" aria-hidden="true">
        {(['lift', 'run', 'flat', 'pause'] as const).map((kind) => (
          <li key={kind}>
            <i style={{ background: colors[kind] }} /> {kindLabel[kind]}
          </li>
        ))}
      </ul>
    </figure>
  );
}
