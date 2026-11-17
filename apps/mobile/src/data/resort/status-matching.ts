import type { GeographicLift } from '@/data/resort/zillertal-arena-lifts';
import type {
  PisteGeometry,
  PisteDifficulty,
} from '@/data/resort/liftradar-pistes';
import type {
  LiftOperationalStatus,
  PisteStatus,
  PisteLevel,
  LiftStatus,
} from '@/types/resort';

const aliases: Record<string, string[]> = {
  Arbiskogel: ['2er Arbiskogel'],
  Sonnalm: ['2er Sonnalm'],
  'Speedy Filzsteinbahn': ['4er Filzsteinbahn Speedy'],
  'Karspitz X-Press': ['6er Karspitz X-Press'],
  'Hanser X-Press': ['6er Hanser X-Press'],
  'Kreuzjoch X-Press': ['6er Kreuzjoch X-Press'],
  'Krummbach X-Press': ['6er Krummbach X-Press'],
  'Ebenfeld X-Press': ['6er Ebenfeld X-Press'],
  'Fussalm X-Press': ['6er Fussalm X-Press'],
  Larmachbahn: ['6er Larmach'],
  Mitterlegerbahn: ['6er Mitterleger'],
  'Kreuzwiesen-X-Press': ['6er Kreuzwiesn-X-Press'],
  'Moseltret X-Press': ['6er Moseltret-X-Press'],
  Kapauns: ['8er Sesselbahn Kapauns'],
  Duxerlift: ['Duxer Tellerlift'],
  'Duxer-X-Press': ['Duxer X-Press'],
  'Filzstein I': ['Filzsteinlift 1'],
  'Filzstein II': ['Filzsteinlift 2'],
  Falschbach: ['Falschbachbahn'],
  'Königsleiten Gipfelbahn': ['Gipfelbahn'],
  Stuanmandlbahn: ['10er Stuanmandl'],
  'Dorfbahn Königsleiten I': ['Dorfbahn 1'],
  'Dorfbahn Königsleiten II': ['Dorfbahn 2'],
  'Dorfbahn Gerlos I': ['Dorfbahn Gerlos 1'],
  'Dorfbahn Gerlos II': ['Dorfbahn Gerlos 2'],
  'Karspitzbahn I': ['Karspitzbahn 1'],
  'Karspitzbahn II': ['Karspitzbahn 2'],
  Märchenwald: ['Märchenwald II'],
  'Märchenwald Babylift': ['Märchenwald I'],
  'Eberharters Almdorflift': ['Almhoflift', 'Eberharterlift'],
};

const unnamedLiftGroups: Record<
  string,
  { label: string; sourceNames: string[] }
> = {
  '1016734459': {
    label: 'Übungsland Rosenalm',
    sourceNames: ['Babylift Rosenalm'],
  },
  '1016734460': {
    label: 'Übungsland Rosenalm',
    sourceNames: ['Babylift Rosenalm'],
  },
  '344386575': {
    label: 'Übungsland Rosenalm',
    sourceNames: ['Babylift Rosenalm'],
  },
  '344388795': {
    label: 'Kinderland Gerlos',
    sourceNames: ['Kinderland Gerlos'],
  },
  '344889632': {
    label: 'Kinderland Gerlos',
    sourceNames: ['Kinderland Gerlos'],
  },
  '344889633': {
    label: 'Kinderland Gerlos',
    sourceNames: ['Kinderland Gerlos'],
  },
  '344895857': {
    label: 'Babylift Gerlosstein',
    sourceNames: ['Babylift Gerlosstein'],
  },
  '956559545': {
    label: 'Babylift Gerlosstein',
    sourceNames: ['Babylift Gerlosstein'],
  },
  '991919362': {
    label: 'Förderband Duxeralm',
    sourceNames: ['Förderbahnd Duxeralm', 'Förderband Duxeralm'],
  },
};

export function statusFor(
  lift: GeographicLift,
  statuses: Map<string, LiftOperationalStatus>,
): LiftOperationalStatus {
  const names = [
    ...(lift.name ? [lift.name, ...(aliases[lift.name] ?? [])] : []),
    ...(unnamedLiftGroups[lift.id]?.sourceNames ?? []),
  ];
  const matched = names
    .map((name) => statuses.get(normalize(name)))
    .filter((status): status is LiftOperationalStatus => status !== undefined);
  return consensus(matched);
}

export function createPisteStatusIndex(pistes: PisteStatus[]) {
  const index = new Map<string, PisteStatus[]>();
  const add = (key: string, piste: PisteStatus) =>
    index.set(key, [...(index.get(key) ?? []), piste]);
  for (const piste of pistes) {
    if (piste.ref) {
      add(`ref:${piste.ref}:${piste.level}`, piste);
      add(`ref:${piste.ref}:any`, piste);
    }
    add(`name:${normalize(piste.name)}`, piste);
  }
  return index;
}

export function pisteStatusForRef(
  ref: string,
  pistes: PisteStatus[],
): LiftOperationalStatus {
  const normalizedRef = ref.toLocaleLowerCase('de-DE');
  const matches = pistes.filter((piste) => {
    const pisteRef =
      piste.ref?.toLocaleLowerCase('de-DE') ??
      piste.name.match(/^(\d+[a-z]?)\b/i)?.[1]?.toLocaleLowerCase('de-DE');
    return pisteRef === normalizedRef;
  });
  return consensus(matches.map((item) => item.status));
}

export function pisteStatusFor(
  piste: PisteGeometry,
  index: Map<string, PisteStatus[]>,
): PisteStatus | null {
  const numericName = piste.name
    ?.match(/^(\d+[a-z]?)\b/i)?.[1]
    ?.toLocaleLowerCase('de-DE');
  const ref = piste.ref?.toLocaleLowerCase('de-DE') ?? numericName;
  const exactRefMatches = ref
    ? (index.get(`ref:${ref}:${levelForDifficulty(piste.difficulty)}`) ?? [])
    : [];
  const refMatches =
    exactRefMatches.length > 0
      ? exactRefMatches
      : ref
        ? (index.get(`ref:${ref}:any`) ?? [])
        : [];
  const candidates = [
    ...refMatches,
    ...(piste.name ? (index.get(`name:${normalize(piste.name)}`) ?? []) : []),
  ];
  if (candidates.length === 0) return null;
  return {
    ...candidates[0],
    status: consensus(candidates.map((item) => item.status)),
  };
}

function levelForDifficulty(difficulty: PisteDifficulty): PisteLevel {
  if (difficulty === 'novice' || difficulty === 'easy') return 'blue';
  if (difficulty === 'intermediate') return 'red';
  if (difficulty === 'advanced') return 'black';
  return 'unknown';
}

export function normalize(value: string) {
  return value
    .toLocaleLowerCase('de-DE')
    .replaceAll('ß', 'ss')
    .replace(/[^a-z0-9äöü]/g, '');
}

export function displayName(lift: GeographicLift) {
  return (
    lift.name ??
    unnamedLiftGroups[lift.id]?.label ??
    'Förderband / Übungsanlage'
  );
}

function consensus(values: LiftOperationalStatus[]): LiftOperationalStatus {
  const unique = new Set(values);
  return unique.size === 1 ? values[0] : 'unknown';
}

export function createLiftStatusIndex(lifts: LiftStatus[]) {
  const index = new Map<string, LiftOperationalStatus>();
  for (const lift of lifts) {
    const key = normalize(lift.name);
    index.set(
      key,
      index.has(key) ? consensus([index.get(key)!, lift.status]) : lift.status,
    );
  }
  return index;
}
