// Units: meters, seconds (m/s for speeds), timestamps in ms since the UTC epoch.

export type RawPoint = {
  t: number;
  lat: number;
  lon: number;
  /** Altitude in meters (GPS). Prefer mean sea level; WGS84-ellipsoid values are
   * offset by the geoid height (about +47 m in the Alps) - harmless for climbs. */
  alt?: number | null;
  /** Horizontal accuracy (1 sigma radius) in meters. */
  acc?: number | null;
  /** Vertical accuracy in meters. */
  vacc?: number | null;
  /** WGS84-ellipsoid altitude, recorded when no mean-sea-level altitude is available. */
  altE?: number | null;
  /** Speed reported by the provider in m/s (not used for the stats). */
  speed?: number | null;
  /** Barometric pressure in hPa, when the device has a pressure sensor. */
  pressureHpa?: number | null;
};

export type SegmentKind = 'lift' | 'run' | 'flat' | 'pause';
export type Quality = 'high' | 'medium' | 'low';

export type Segment = {
  kind: SegmentKind;
  /** Index range into `TrackAnalysis.points`; endIndex is the first point of the next segment. */
  startIndex: number;
  endIndex: number;
  startT: number;
  endT: number;
  durationS: number;
  distanceM: number;
  ascentM: number;
  descentM: number;
  avgSpeedMs: number;
  maxSpeedMs: number;
  quality: Quality;
};

export type AnalyzedPoint = {
  t: number;
  lat: number;
  lon: number;
  alt: number;
};

// All thresholds are EXPERIMENTAL starting values, tuned on synthetic tracks, and
// must be validated with real ski days before the results are presented as reliable.
export type GpsConfig = {
  maxAccuracyM: number;
  maxSpeedMs: number;
  resyncAfterJumps: number;
  windowSec: number;
  pauseSpeedMs: number;
  liftMinVerticalMs: number;
  liftMinHorizontalMs: number;
  liftMaxHorizontalMs: number;
  runMinDescentMs: number;
  runMinHorizontalMs: number;
  flatMinHorizontalMs: number;
  minSegmentSec: Record<SegmentKind, number>;
  minLiftAscentM: number;
  minRunDescentM: number;
  maxStepSec: number;
  gapSec: number;
  altitudeDeadbandM: number;
  baroGpsGainPerSec: number;
  minPointsForStats: number;
};

export const defaultGpsConfig: GpsConfig = {
  maxAccuracyM: 50,
  maxSpeedMs: 45,
  resyncAfterJumps: 5,
  windowSec: 20,
  pauseSpeedMs: 0.5,
  liftMinVerticalMs: 0.25,
  liftMinHorizontalMs: 1.2,
  liftMaxHorizontalMs: 9,
  runMinDescentMs: 0.35,
  runMinHorizontalMs: 1.5,
  flatMinHorizontalMs: 0.5,
  minSegmentSec: { lift: 40, run: 15, flat: 20, pause: 45 },
  minLiftAscentM: 30,
  minRunDescentM: 20,
  maxStepSec: 60,
  gapSec: 90,
  altitudeDeadbandM: 1.5,
  baroGpsGainPerSec: 0.01,
  minPointsForStats: 20,
};

export type DropReason =
  | 'invalid_coordinates'
  | 'null_island'
  | 'duplicate_time'
  | 'non_monotonic_time'
  | 'low_accuracy'
  | 'speed_jump';
