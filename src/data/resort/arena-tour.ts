import type { PisteGeometry } from "@/data/resort/liftradar-pistes";

// Official Arena Tour objects from the Zillertal Arena Intermaps layer.
// The lift IDs below are the corresponding OpenStreetMap geometries used by our map.
export const arenaTourLiftIds = new Set([
  "1495249505", // Karspitzbahn I
  "43112891", // Karspitzbahn II
  "31895402", // Rosenalmbahn II
  "29149340", // Karspitz X-Press
  "29149587", // Hanser X-Press
  "29149586", // Kreuzjoch X-Press
  "776227468", // Kapauns
  "31895940", // Teufeltal
  "46766445", // Moseltret X-Press
  "46766444", // Fussalm X-Press
  "46766443", // Falschbach
  "46766437", // Plattenkogel X-Press I
  "25478934", // Plattenkogel X-Press II
  "25478842", // Speedy Filzsteinbahn
  "29714039", // Duxer 6er Bubble
  "25558709", // Sonnwendkopfbahn
  "46766447", // Königsleiten Gipfelbahn
  "46766438", // Krummbach X-Press
  "46766440", // Ebenfeld X-Press
  "46766442", // Stuanmandlbahn
  "776227469", // Wilde Krimml
]);

export const arenaTourPisteRefs = new Set([
  "10",
  "11",
  "13",
  "18",
  "19",
  "19b",
  "19c",
  "20",
  "21",
  "22",
  "32",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "51",
  "52",
  "53a",
  "55a",
  "55b",
  "70",
  "71",
  "73",
  "74",
  "76",
  "78",
  "82",
  "83",
]);

export const arenaTourUrl =
  "https://www.zillertalarena.com/winter/skigebiet/lifte-pisten/arena-tour/";

export type ArenaTourSegment =
  | { kind: "lift"; liftId: string }
  | { kind: "pistes"; refs: string[] };

export type ArenaTourLeg = {
  area: string;
  segments: ArenaTourSegment[];
};

// Direction ARENATOUR 2: Hochkrimml – Königsleiten – Gerlos – Zell.
export const arenaTourFromHochkrimml: ArenaTourLeg[] = [
  {
    area: "Hochkrimml · Filzstein",
    segments: [
      { kind: "lift", liftId: "25478842" },
      { kind: "pistes", refs: ["78", "76"] },
    ],
  },
  {
    area: "Hochkrimml · Duxer",
    segments: [
      { kind: "lift", liftId: "29714039" },
      { kind: "pistes", refs: ["76", "74", "73", "71", "70"] },
    ],
  },
  {
    area: "Königsleiten",
    segments: [
      { kind: "lift", liftId: "25558709" },
      { kind: "pistes", refs: ["53a"] },
      { kind: "lift", liftId: "46766447" },
      { kind: "pistes", refs: ["39", "38", "37"] },
    ],
  },
  {
    area: "Gerlos",
    segments: [
      { kind: "lift", liftId: "46766438" },
      { kind: "pistes", refs: ["32"] },
      { kind: "lift", liftId: "46766440" },
      { kind: "pistes", refs: ["32"] },
      { kind: "lift", liftId: "46766442" },
      { kind: "pistes", refs: ["35"] },
      { kind: "lift", liftId: "776227469" },
    ],
  },
  {
    area: "Übergangsjoch → Zell",
    segments: [
      {
        kind: "pistes",
        refs: ["22", "19", "19c", "19b", "11", "10"],
      },
    ],
  },
];

export function isArenaTourPiste(piste: PisteGeometry) {
  const labels = `${piste.ref ?? ""} ${piste.name ?? ""}`
    .toLocaleLowerCase("de-DE")
    .match(/\d+[a-z]?/g);
  return labels?.some((label) => arenaTourPisteRefs.has(label)) ?? false;
}
