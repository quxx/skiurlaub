import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeatherScene, sceneKind } from './WeatherScene';

describe('sceneKind', () => {
  it.each([
    [0, 'clear'],
    [1, 'clear'],
    [2, 'partly'],
    [3, 'overcast'],
    [45, 'fog'],
    [48, 'fog'],
    [53, 'rain'],
    [66, 'rain'],
    [81, 'rain'],
    [73, 'snow'],
    [86, 'snow'],
    [95, 'storm'],
    [99, 'storm'],
    [60.5, 'rain'],
    [4, 'overcast'],
  ])('code %s -> %s', (code, kind) => {
    expect(sceneKind(code)).toBe(kind);
  });
});

describe('WeatherScene', () => {
  it('is decorative and exposes kind and day state', () => {
    const { container } = render(<WeatherScene kind="snow" isDay={false} />);
    const scene = container.querySelector('.weather-scene')!;
    expect(scene.getAttribute('aria-hidden')).toBe('true');
    expect(scene.getAttribute('data-kind')).toBe('snow');
    expect(scene.getAttribute('data-day')).toBe('false');
    expect(container.querySelectorAll('.ws-flake').length).toBeGreaterThan(0);
    expect(container.querySelector('.ws-drop')).toBeNull();
  });

  it('shows sun by day and moon with stars by night only for clear skies', () => {
    const day = render(<WeatherScene kind="clear" isDay />);
    expect(day.container.querySelector('.ws-star')).toBeNull();
    const night = render(<WeatherScene kind="clear" isDay={false} />);
    expect(night.container.querySelector('.ws-star')).not.toBeNull();
    const rain = render(<WeatherScene kind="rain" isDay={false} />);
    expect(rain.container.querySelector('.ws-star')).toBeNull();
    expect(rain.container.querySelector('.ws-drop')).not.toBeNull();
  });
});
