import type { LiftRef } from '@skiurlaub/gps';
import { zillertalArenaLifts } from '@/data/resort/zillertal-arena-lifts';

export const liftTypeLabel: Record<string, string> = {
  cable_car: 'Seilbahn',
  chair_lift: 'Sessellift',
  gondola: 'Gondelbahn',
  magic_carpet: 'Förderband',
  platter: 'Tellerlift',
  rope_tow: 'Seillift',
  't-bar': 'Schlepplift',
};

// Terminals of the known Zillertal Arena lifts (OpenSkiData / OSM, ODbL) in the
// [lat, lon] order the GPS matcher expects.
export const liftRefs: LiftRef[] = zillertalArenaLifts.map((lift) => ({
  id: lift.id,
  name: lift.name,
  type: lift.type,
  a: [lift.points[0][1], lift.points[0][0]],
  b: [lift.points[1][1], lift.points[1][0]],
}));
