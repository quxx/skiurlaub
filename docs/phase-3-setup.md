# Phase 3 – Projektsetup

Stand: 4. November 2026

## Ergebnis

Der Designprototyp wurde in eine produktionsnahe React-/TypeScript-Basis
überführt. Das Projekt ist lokal buildbar und enthält bewusst noch keine
Live-API-Anbindung, keinen laufenden Countdown und keine simulierten
Produktionswerte.

Die React-Version bildet das freigegebene Phase-2-Layout für „Aktuelle
Bedingungen“ und „7-Tage-Ausblick“ ab. Sichtbare Wetter- und Forecastwerte
sind ausschließlich mit dem Badge „Demo“ gekennzeichnet.

## Installierter Stack

| Paket | Version | Aufgabe |
| --- | --- | --- |
| React / React DOM | 19.3.1 | UI und Komponentenmodell |
| Vite | 8.3.5 | Entwicklungsserver und Produktionsbuild |
| TypeScript | 7.0.2 | strikte Typisierung |
| Tailwind CSS | 4.3.4 | Design Tokens und Utility Styling |
| Lucide React | 1.68.0 | tree-shakable SVG-Icons |

Tailwind ist über den offiziellen Vite-Pluginweg `@tailwindcss/vite`
eingerichtet. Das Stylesheet verwendet den Tailwind-v4-Import und definiert
die „Alpine Blue Hour“-Farben als CSS-basierte Theme Tokens.

## Projektstruktur

```text
src/
  app/
    App.tsx
    trip-config.ts
  assets/
    hochkrimml-hero.png
  components/
    dashboard/DashboardPreview.tsx
    forecast/ForecastPreview.tsx
    hero/TripHero.tsx
    layout/AppFooter.tsx
    ui/DataCard.tsx
    ui/IconTile.tsx
    ui/StatusBadge.tsx
  data/
    resort/provider.ts
    resort/unavailable-provider.ts
    weather/provider.ts
  styles/
    index.css
  types/
    data.ts
    resort.ts
    weather.ts
  main.tsx
  vite-env.d.ts
```

## Architekturgrenzen

- UI-Komponenten importieren keine externen API-Antworttypen.
- `DataEnvelope<T>` hält Datenart, Quelle, Beobachtungszeit und Freshness
  zusammen.
- Wetter- und Resort-Provider sind getrennt.
- Der anfängliche Resort-Provider liefert immer einen ehrlichen
  `unavailable`-Zustand.
- Die Reise- und Standortkonfiguration liegt zentral in `trip-config.ts`.
- Geheimnisse werden nicht über `VITE_*` konfiguriert. Diese Variablen sind
  ausschließlich für öffentliche Build-Konfiguration gedacht.

## Umgebungskonfiguration

`.env.example` dokumentiert:

- Start- und optionales Enddatum
- Zeitzone `Europe/Vienna`
- Koordinaten und Höhe für Hochkrimml

Lokale Abweichungen gehören in `.env.local`, das von Git ignoriert wird.

## Scripts

```bash
npm run dev       # lokaler Vite-Server
npm run typecheck # TypeScript-Projektprüfung
npm run build     # Typecheck plus statischer Produktionsbuild
npm run preview   # lokaler Test des Builds
```

## Bewusste Phase-3-Grenze

Folgende Funktionen waren in Phase 3 lediglich als UI-Slots sichtbar und
wurden anschließend in Phase 4 implementiert:

- sekundengenauer Countdown
- automatische Vorfreude-/Urlaubs-/Rückblick-Modi
- responsive Wetter- und Forecast-Komponenten mit Zustandslogik
- lokale Zustands- und Fehlerdarstellung

Polling und Cache gehören zur echten Open-Meteo-Integration in Phase 5. Offizielle
Resortwerte bleiben „Nicht verbunden“, bis ein autorisierter Feed existiert.
