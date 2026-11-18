import { z } from 'zod';
import { fetchJson } from '@/data/remote';

export type PisteDifficulty =
  'novice' | 'easy' | 'intermediate' | 'advanced' | 'unknown';

export type PisteGeometry = {
  id: string;
  difficulty: PisteDifficulty;
  name: string | null;
  ref: string | null;
  paths: Array<Array<[number, number]>>;
  isArea: boolean;
};

const coordinate = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .rest(z.number());
export const skiTileSchema = z.object({
  areas: z.array(z.object({ name: z.string().optional() })).max(1000),
  runs: z
    .array(
      z.object({
        areas: z.array(z.number().int().nonnegative()).optional(),
        c: z.array(coordinate).max(20000).optional(),
        poly: z.array(z.array(coordinate).max(20000)).optional(),
        difficulty: z.string().optional(),
        lr: z.string().optional(),
        name: z.string().optional(),
        osm: z.string().optional(),
        ref: z.string().optional(),
        uses: z.array(z.string()).optional(),
      }),
    )
    .max(20000),
});
type SkiTile = z.infer<typeof skiTileSchema>;

const tileUrls = [
  'https://liftradar.eu/ski/v1/10/545/359.json',
  'https://liftradar.eu/ski/v1/10/546/359.json',
];

const includedAreas = new Set([
  'Gerlosstein / Hainzenberg',
  'Wintersportschule Krimml',
  'Zillertal Arena',
]);

// One shared request per app session: the resort map and the GPS evaluation use the same
// tiles. A failed load is not cached. Callers can still abandon waiting via their signal.
let shared: Promise<PisteGeometry[]> | null = null;
export function loadZillertalArenaPistes(
  signal?: AbortSignal,
): Promise<PisteGeometry[]> {
  shared ??= fetchPistes().catch((error: unknown) => {
    shared = null;
    throw error;
  });
  const request = shared;
  if (!signal) return request;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    });
    request.then(resolve, reject);
  });
}

async function fetchPistes(): Promise<PisteGeometry[]> {
  const tiles = await Promise.all(
    tileUrls.map(async (url) => {
      return skiTileSchema.parse(await fetchJson(url));
    }),
  );

  const pistes = new Map<string, PisteGeometry>();
  for (const tile of tiles) {
    const areaIndexes = new Set(
      tile.areas.flatMap((area, index) =>
        includedAreas.has(area.name ?? '') ? [index] : [],
      ),
    );

    for (const run of tile.runs) {
      if (!run.uses?.includes('downhill')) continue;
      if (isExcludedRoute(run)) continue;
      const belongsToArena =
        run.lr === 'at/zillertal-arena' ||
        run.areas?.some((index) => areaIndexes.has(index));
      if (!belongsToArena) continue;

      const paths = run.c
        ? [coordinatePath(run.c)]
        : (run.poly ?? []).map(coordinatePath);
      if (paths.length === 0 || paths.every((path) => path.length < 2))
        continue;

      const geometryKey = paths
        .map((path) => `${path[0]?.join(',')}:${path.at(-1)?.join(',')}`)
        .join('|');
      const id = `${run.osm ?? 'run'}:${run.c ? 'line' : 'area'}:${geometryKey}`;
      pistes.set(id, {
        id,
        difficulty: difficultyFor(run.difficulty),
        name: run.name ?? null,
        ref: run.ref ?? null,
        paths,
        isArea: Boolean(run.poly),
      });
    }
  }
  return [...pistes.values()];
}

function coordinatePath(points: number[][]): Array<[number, number]> {
  return points.flatMap((point) =>
    typeof point[0] === 'number' && typeof point[1] === 'number'
      ? [[point[1], point[0]] as [number, number]]
      : [],
  );
}

function difficultyFor(value?: string): PisteDifficulty {
  if (
    value === 'novice' ||
    value === 'easy' ||
    value === 'intermediate' ||
    value === 'advanced'
  )
    return value;
  return 'unknown';
}

function isExcludedRoute(run: SkiTile['runs'][number]): boolean {
  const excludedUses = new Set([
    'hike',
    'nordic',
    'skitour',
    'sled',
    'winter_hike',
  ]);
  if (run.uses?.some((use) => excludedUses.has(use))) return true;
  if (run.difficulty === 'freeride') return true;

  const label = `${run.name ?? ''} ${run.ref ?? ''}`.toLocaleLowerCase('de-DE');
  return /ski[ -]?route|winterwander|wanderweg|loipe|rodel/.test(label);
}
