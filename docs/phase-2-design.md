# Phase 2 – Designsystem und Dashboard-Konzept

Stand: 4. November 2026

## Ergebnis

Die visuelle Richtung heißt **Alpine Blue Hour**: eine ruhige, dunkle
Ski-App-Oberfläche, bei der das Bergpanorama Atmosphäre schafft und die
Informationen wie präzise Instrumente darüberliegen. Das Design nutzt
Glassmorphism nur für Hierarchie und Tiefe, nicht als Selbstzweck.

Die klickbare Vorschau liegt unter
[`design-preview/index.html`](../design-preview/index.html). Sie ist ein
buildloser HTML-/CSS-/JavaScript-Prototyp und noch keine Produktionsanwendung.
Alle Messwerte sind ausdrücklich als Design-Beispieldaten markiert.

## Leitprinzipien

1. **Vorfreude vor Abreise:** Countdown, Ziel und emotionale Bildwelt erhalten
   die größte Fläche.
2. **Handlungsfähigkeit im Urlaub:** Wetter, Wind, Lifte und Pisten wandern im
   Urlaubsmodus nach oben und werden schneller erfassbar.
3. **Ehrliche Daten:** Datenart, Quelle, Alter und Verfügbarkeit sind Teil des
   Designs und keine Fußnote.
4. **Ruhige Dichte:** Große Zahlen, kurze Labels und starke Abstände vermeiden
   den Eindruck eines überladenen Kontrollzentrums.
5. **Mobile zuerst gedacht:** keine Desktop-Karten, die auf dem Smartphone nur
   schmaler werden; Reihenfolge und Priorität ändern sich bewusst.

## Design Tokens

### Farben

| Token | Wert | Einsatz |
| --- | --- | --- |
| `midnight-950` | `#050B14` | Seitenhintergrund |
| `navy-900` | `#081524` | Karten und dunkle Verläufe |
| `ice-50` | `#F5FBFF` | Primärtext |
| `ice-200` | `#CDECF4` | Sekundärtext |
| `glacier-400` | `#63D5E6` | Fokus, Fortschritt, aktive Zustände |
| `turquoise-400` | `#2DD4BF` | positive Live-Zustände |
| `amber-300` | `#F6C76A` | veraltet, Hinweis, Sonnenlicht |
| `danger-300` | `#FF8E91` | echte Fehler und Schließungen |

Flächen verwenden halbtransparentes Navy mit einer hellen Kontur. Karten
erhalten maximal `backdrop-filter: blur(18px)`; auf Geräten ohne Unterstützung
bleibt der Hintergrund ausreichend deckend.

### Typografie

- Schriftfamilie: moderner System-Sans-Stack; keine externe Font-Abhängigkeit
- Eyebrow/Metadaten: 11–12 px, Versalien, erhöhte Laufweite
- Fließtext: 15–17 px bei mindestens 1,5 Zeilenhöhe
- Kartenwert: 32–48 px, tabellarische Ziffern
- Hero: responsiv mit `clamp(3.3rem, 9vw, 8.75rem)`
- Countdown: tabellarische Ziffern, optisch ruhige Trennzeichen

### Form, Raster und Abstand

- Kartenradius: 24 px Desktop, 20 px Mobile
- kleine Controls und Badges: vollständig gerundet
- Desktop-Raster: 12 Spalten, maximal 1.320 px Inhaltsbreite
- Kartenraster: 4 Spalten; Wetter doppelte Breite, drei Statuskarten je einfach
- Tablet: 2 Spalten
- Mobile: 1 Spalte, Prognose als horizontale Scroll-Snap-Liste
- Basiseinheit: 4 px; typische Abstände 8, 12, 16, 24, 32, 48 und 72 px

## Zustände

### Vorfreude

- großer Titel und Countdown im Hero
- Wettertrend als sekundärer Ausblick
- Resort-Livewerte bewusst untergeordnet, da der heutige Liftstatus keine
  Aussage über den Urlaubstag trifft
- CTA führt zur Wetterprognose und Datenquellen-Erklärung

### Im Skiurlaub

- Begrüßung „It's Ski Time!“ statt großem Countdown
- Hero kompakter; Bedingungen werden bereits im sichtbaren Bereich angedeutet
- grüne Statusfarbe nur bei tatsächlich frischen, offiziellen Daten
- Wetter, Wind und offizieller Resortbericht sind primäre Touchziele

Die Designvorschau enthält oben einen Modusschalter, damit beide Hierarchien
ohne Manipulation des Systemdatums beurteilt werden können.

## Komponenten

### Hero

Eigenes textfreies Alpenmotiv, dunkler Verlauf für WCAG-tauglichen Kontrast,
ruhige Schneepartikel nur bei erlaubter Bewegung. Text bleibt HTML und damit
skalierbar, übersetzbar und zugänglich.

### Countdown

Vier Zellen für Tage, Stunden, Minuten und Sekunden. Die Einheit bleibt auch
bei kleinen Displays sichtbar. Zahlenwechsel nutzt nur Opacity/Translate und
wird bei `prefers-reduced-motion` deaktiviert.

### Statuskarten

Gemeinsame Anatomie:

```text
[Icon] Bezeichnung                 [Daten-Badge]
       großer Wert
       kurze Einordnung
       Visualisierung / Details
       Quelle · Aktualisierungszeit
```

Badges unterscheiden `Prognose`, `Offiziell`, `Demo`, `Veraltet` und
`Nicht verfügbar`. Farbe ist nie das einzige Unterscheidungsmerkmal.

### 7-Tage-Prognose

Auf Desktop eine durchgehende Reihe, auf Mobile eine horizontale
Scroll-Snap-Liste. Erwarteter Schneefall erhält eine eisblaue Hervorhebung;
Temperatur und Wettericon bleiben visuell dominant.

### Snow Forecast

Kleine Balkengrafik mit echtem HTML-Text für Werte und Tage. Sie wird später
als zugängliche SVG-Komponente umgesetzt und bekommt zusätzlich eine
tabellarische Textalternative.

## Interaktion und Bewegung

- 160–220 ms für Controls und Hoverzustände
- 400–600 ms für größere Layoutübergänge
- keine Bewegung, die Datenaktualität vortäuscht
- Schneefall nur dekorativ, langsam und ressourcenschonend
- vollständige Reduktion über `prefers-reduced-motion`
- sichtbare Fokusrahmen mit Eisblau und dunklem Außenring

## Accessibility

- semantische Bereiche, Überschriftenfolge und echte Buttons
- Kontrast der wichtigsten Texte mindestens 4,5:1
- Touchziele mindestens 44 × 44 px
- Status nicht ausschließlich über Farbe
- dekorative Icons sind für Screenreader verborgen
- keine automatisch startenden Videos oder Webcamstreams
- horizontale Listen behalten Tastatur- und Trackpad-Navigation

## Hero-Asset

`design-preview/assets/hochkrimml-hero.png` wurde mit dem integrierten
Bildgenerator als projektgebundenes, textfreies Hero-Motiv erstellt.

Finaler Prompt, gekürzt auf die gestalterisch relevanten Vorgaben:

> Photorealistisches Hochkrimml-inspiriertes Winterpanorama zur blauen Stunde,
> dunkle freie Fläche links für UI-Text, Bergdetails rechts, Midnight Navy,
> Eisblau und dezenter warmer Horizont; keine Personen, Texte, Logos oder
> Wasserzeichen.

## Freigabekriterien für Phase 3

- visuelle Richtung „Alpine Blue Hour“ wird beibehalten
- Moduswechsel und mobile Priorisierung sind fachlich bestätigt
- Hero-Motiv darf als Projektasset verwendet werden
- Phase 3 überträgt den Prototyp in React, TypeScript, Vite und Tailwind;
  Beispieldaten bleiben bis zur API-Phase deutlich markiert
