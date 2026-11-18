import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { analyzeTrack, skiDayLegs, synthesizeTrack } from '@skiurlaub/gps';
import { ElevationChart } from './ElevationChart';

const analysis = analyzeTrack(
  synthesizeTrack(skiDayLegs(2), { withBaro: true, seed: 3 }),
);

describe('ElevationChart', () => {
  it('zeichnet jeden Abschnitt und eine Legende', () => {
    const { container } = render(
      <ElevationChart
        points={analysis.points}
        segments={analysis.segments}
        selected={null}
        onSelect={() => undefined}
      />,
    );
    // Linie je Abschnitt; Flächen nur für Abschnitte außer Pause.
    const lines = container.querySelectorAll('path[fill="none"]');
    expect(lines).toHaveLength(analysis.segments.length);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(
      /Höhenprofil/,
    );
    expect(container.querySelectorAll('.elevation-legend li')).toHaveLength(4);
    expect(container.textContent).toMatch(/\d{2}:\d{2}/);
  });

  it('hebt den gewählten Abschnitt hervor und dimmt die anderen', () => {
    const { container } = render(
      <ElevationChart
        points={analysis.points}
        segments={analysis.segments}
        selected={1}
        onSelect={() => undefined}
      />,
    );
    const groups = Array.from(container.querySelectorAll('svg > g[opacity]'));
    const dimmed = groups.filter((g) => g.getAttribute('opacity') === '0.35');
    expect(dimmed).toHaveLength(analysis.segments.length - 1);
  });

  it('meldet den gewählten Abschnitt beim Antippen', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ElevationChart
        points={analysis.points}
        segments={analysis.segments}
        selected={null}
        onSelect={onSelect}
      />,
    );
    const svg = container.querySelector('svg')!;
    svg.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 360,
        top: 0,
        height: 176,
        right: 360,
        bottom: 176,
      }) as DOMRect;
    svg.setPointerCapture = () => undefined;
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 80, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledTimes(1);
    const arg = onSelect.mock.calls[0][0];
    expect(arg === null || arg >= 0).toBe(true);
  });
});
