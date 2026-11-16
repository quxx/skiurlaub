# SkiTrip 2027 – Hochkrimml

Persönliches Countdown- und Live-Dashboard für Hochkrimml in der Zillertal Arena.

Phase 1 bis Phase 5 sind abgeschlossen:

- [Architektur und Datenquellen](docs/phase-1-konzept.md)
- [Designsystem und Responsive-Konzept](docs/phase-2-design.md)
- [Interaktive Designvorschau](design-preview/index.html)
- [Projektsetup und Komponentenarchitektur](docs/phase-3-setup.md)
- [Frontend-Logik und automatische Reisephasen](docs/phase-4-frontend.md)
- [Open-Meteo-Wetterintegration](docs/phase-5-wetterdaten.md)
- [Lift- und Pistenstatus über status.live](docs/status-live-resortdaten.md)

## Lokale Entwicklung

```bash
npm install
npm run dev
```

Weitere Prüfungen:

```bash
npm run typecheck
npm run build
```

Stack: React, TypeScript, Vite, Tailwind CSS und Lucide Icons.

Wetter, modellierte Schneedecke am Standort, auswählbare 7-Tage-Prognose und
stündliche Detailansicht werden direkt von Open-Meteo geladen. Die Schneedecke
ist klar als Modellwert und nicht als offizielle Berg- oder Talschneehöhe des
Skigebiets gekennzeichnet. Wenn die Quelle nicht erreichbar ist, zeigt die
Oberfläche einen Lade- oder Fehlerzustand an und verwendet keine Ersatzdaten.

Lift- und Pistenmeldungen für die gesamte Zillertal Arena kommen zusätzlich
über `status.live`. Sie sind als nichtoffizieller Drittanbieterstatus mit
Quelle und Aktualisierungszeit gekennzeichnet. Die geografische Liftkarte nutzt
OpenSkiData/OpenSkiMap-Geometrien aus OpenStreetMap (ODbL) und verknüpft sie mit
den Einzelmeldungen von `status.live`. Eine interaktive Leaflet-Karte lädt dafür
nur die im sichtbaren Ausschnitt benötigten OpenStreetMap-Kacheln. Zusätzlich
werden die kartierten Abfahrtspisten aus den OpenSkiData-Gebietskacheln von
LiftRadar nach Schwierigkeit eingezeichnet und über Pistennummer plus
Schwierigkeitsgrad mit den Einzelstatus von `status.live` verknüpft. Eine
eigene Arena-Tour-Ansicht filtert die Karte auf die Lifte und Pistennummern
des offiziellen Intermaps-Tour-Layers für die Runde Hochkrimml–Zell. Eine
offizielle Schneehöhe ist weiterhin nicht angebunden; der offizielle
Schneebericht bleibt verlinkt.
