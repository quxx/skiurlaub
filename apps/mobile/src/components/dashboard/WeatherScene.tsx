import type { CSSProperties } from 'react';
import './weather-scene.css';

export type SceneKind =
  'clear' | 'partly' | 'overcast' | 'fog' | 'rain' | 'snow' | 'storm';

// Maps WMO weather codes (as used by Open-Meteo) to one illustrated scene.
export function sceneKind(code: number): SceneKind {
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'overcast';
}

// Deterministic pseudo-random layout so renders are stable (no Math.random).
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(7);
const between = (min: number, max: number) => min + rand() * (max - min);

const drops = Array.from({ length: 26 }, () => ({
  x: Math.round(between(-10, 420)),
  delay: -between(0, 1.2).toFixed(2),
  dur: between(0.7, 1.1).toFixed(2),
}));
const flakes = Array.from({ length: 30 }, () => ({
  x: Math.round(between(0, 400)),
  r: between(1, 2.3).toFixed(1),
  delay: -between(0, 9).toFixed(1),
  dur: between(6, 10).toFixed(1),
}));
const stars = Array.from({ length: 16 }, () => ({
  x: Math.round(between(10, 390)),
  y: Math.round(between(8, 110)),
  r: between(0.7, 1.5).toFixed(1),
  delay: -between(0, 5).toFixed(1),
  dur: between(2.5, 5).toFixed(1),
}));
const clouds = [
  { y: 22, s: 1.1, dur: 70, at: 10 },
  { y: 48, s: 0.8, dur: 90, at: 55 },
  { y: 12, s: 1.4, dur: 110, at: 30 },
  { y: 62, s: 1.0, dur: 80, at: 70 },
  { y: 34, s: 1.6, dur: 120, at: 90 },
];
const cloudCount: Record<SceneKind, number> = {
  clear: 1,
  partly: 3,
  overcast: 5,
  fog: 2,
  rain: 5,
  snow: 4,
  storm: 5,
};
const trees = [18, 52, 96, 150, 214, 262, 318, 366];

const CLOUD_PATH =
  'M0 26a11 11 0 0 1 11-11 16 16 0 0 1 30-3 13 13 0 0 1 21 10 10 10 0 0 1 2 20H11A11 11 0 0 1 0 26Z';

export function WeatherScene({
  kind,
  isDay,
}: {
  kind: SceneKind;
  isDay: boolean;
}) {
  const showSun = isDay && (kind === 'clear' || kind === 'partly');
  const showMoon = !isDay && (kind === 'clear' || kind === 'partly');
  const rain = kind === 'rain' || kind === 'storm';
  return (
    <div
      className="weather-scene"
      data-kind={kind}
      data-day={isDay}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          <radialGradient id="ws-sun">
            <stop offset="0" stopColor="#fff6cf" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#ffe08a" stopOpacity="0.45" />
            <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ws-moon">
            <stop offset="0" stopColor="#dbe6ff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#dbe6ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ws-fog">
            <stop offset="0" stopColor="#fff" stopOpacity="0.65" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {showSun && (
          <g className="ws-glow">
            <circle cx="304" cy="64" r="70" fill="url(#ws-sun)" />
            <circle cx="304" cy="64" r="17" fill="#fff3c4" />
          </g>
        )}
        {showMoon && (
          <g className="ws-glow">
            <circle cx="304" cy="60" r="52" fill="url(#ws-moon)" />
            <circle cx="304" cy="60" r="14" fill="#f3efdc" />
            <circle cx="299" cy="56" r="3" fill="#d8d2b8" opacity="0.6" />
            <circle cx="309" cy="65" r="2" fill="#d8d2b8" opacity="0.6" />
          </g>
        )}
        {!isDay &&
          (kind === 'clear' || kind === 'partly') &&
          stars.map((star, index) => (
            <circle
              key={index}
              className="ws-star"
              cx={star.x}
              cy={star.y}
              r={star.r}
              style={{
                animationDelay: `${star.delay}s`,
                animationDuration: `${star.dur}s`,
              }}
            />
          ))}

        {clouds.slice(0, cloudCount[kind]).map((cloud, index) => (
          <g
            key={index}
            className="ws-cloud"
            style={
              {
                animationDuration: `${cloud.dur}s`,
                animationDelay: `-${cloud.at}s`,
                '--x': `${((cloud.at * 5) % 480) - 60}px`,
              } as CSSProperties
            }
          >
            <g
              transform={`translate(0 ${cloud.y}) scale(${cloud.s})`}
              className="ws-cloud-shape"
            >
              <path d={CLOUD_PATH} />
            </g>
          </g>
        ))}

        <path
          className="ws-m1"
          d="M0 150 40 120 70 138 120 92 165 135 200 110 250 150 300 100 350 138 400 118V240H0Z"
        />
        <g className="ws-cap">
          <path d="M105 106 120 92 135 108 127 104 120 111 112 104Z" />
          <path d="M288 113 300 100 313 115 305 111 299 117 293 111Z" />
          <path d="M188 120 200 110 212 122 205 118 199 123 193 118Z" />
        </g>
        {kind === 'fog' && (
          <ellipse
            className="ws-fog ws-fog-a"
            cx="200"
            cy="146"
            rx="320"
            ry="30"
            fill="url(#ws-fog)"
          />
        )}
        <path
          className="ws-m2"
          d="M0 175 60 140 110 170 170 135 230 172 290 145 350 175 400 150V240H0Z"
        />
        <path
          className="ws-m3"
          d="M0 204Q80 176 160 198T320 192T400 186V240H0Z"
        />
        <g className="ws-trees">
          {trees.map((x, index) => (
            <path
              key={x}
              d={`M${x} ${196 - (index % 3) * 3}l5 -16 5 16Zm-1 -8l6 -14 6 14Z`}
            />
          ))}
        </g>
        {kind === 'fog' && (
          <ellipse
            className="ws-fog ws-fog-b"
            cx="200"
            cy="200"
            rx="340"
            ry="36"
            fill="url(#ws-fog)"
          />
        )}

        {rain &&
          drops.map((drop, index) => (
            <line
              key={index}
              className="ws-drop"
              x1={drop.x}
              y1="-18"
              x2={drop.x - 4}
              y2="-4"
              style={{
                animationDelay: `${drop.delay}s`,
                animationDuration: `${drop.dur}s`,
              }}
            />
          ))}
        {kind === 'snow' &&
          flakes.map((flake, index) => (
            <circle
              key={index}
              className="ws-flake"
              cx={flake.x}
              cy="-6"
              r={flake.r}
              style={{
                animationDelay: `${flake.delay}s`,
                animationDuration: `${flake.dur}s`,
              }}
            />
          ))}
        {kind === 'storm' && (
          <rect className="ws-flash" width="400" height="240" fill="#fff" />
        )}
      </svg>
    </div>
  );
}
