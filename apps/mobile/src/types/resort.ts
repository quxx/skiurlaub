export type OperationalStatus = 'open' | 'closed' | 'partial' | 'unknown';
export type LiftOperationalStatus =
  'open' | 'closed' | 'hold' | 'scheduled' | 'unknown';
export type PisteLevel = 'blue' | 'red' | 'black' | 'route' | 'unknown';

export type LiftStatus = {
  name: string;
  status: LiftOperationalStatus;
};

export type PisteStatus = {
  name: string;
  ref: string | null;
  status: LiftOperationalStatus;
  level: PisteLevel;
  kilometers: number | null;
};

export type ResortWebcam = {
  name: string;
  imageUrl: string;
  playerUrl: string;
  sourceUrl: string;
  credit: string;
  latitude: number;
  longitude: number;
};

export type ResortMetric = {
  open: number | null;
  total: number | null;
  status: OperationalStatus;
};

export type ResortStatus = {
  area: 'hochkrimml' | 'zillertal-arena';
  lifts: ResortMetric;
  liftItems: LiftStatus[];
  pisteItems: PisteStatus[];
  webcams: ResortWebcam[];
  pisteKilometers: ResortMetric;
  pisteCount?: ResortMetric;
  snowMountainCentimeters: number | null;
  snowValleyCentimeters: number | null;
  newSnowCentimeters: number | null;
};
