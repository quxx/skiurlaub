# Phase 4 – Frontend-Logik

Stand: 4. November 2026

## Ergebnis

Das Dashboard reagiert jetzt selbstständig auf den Reisezeitpunkt. Der
Countdown läuft sekundengenau, die Reisephase wird regelmäßig neu bewertet
und Wetter-, Schnee-, Pisten- sowie Liftkarten besitzen ehrliche
Verfügbarkeitszustände.

## Automatische Reisephasen

| Zeitraum | Modus | Schwerpunkt |
| --- | --- | --- |
| vor `VITE_TRIP_START` | Vorfreude | Countdown |
| ab Start bis vor `VITE_TRIP_END` | Im Skiurlaub | Schnellüberblick und Dashboard |
| ab `VITE_TRIP_END` | Rückblick | abgeschlossene Reise |

Ist kein Enddatum gesetzt, bleibt die Anwendung nach dem Start im
Urlaubsmodus. Der Countdown verwendet einen ISO-Zeitpunkt mit Offset, wird
nie negativ und berücksichtigt über den absoluten Zeitstempel automatisch
die lokale Zeitzone.

## Live-Datenverhalten

Die Anwendung verwendet ausschließlich die angebundenen Datenquellen. Ohne
erreichbare Quelle erscheinen Lade-, Cache- oder Fehlerzustände statt
erfundener Ersatzwerte. Ein Demo-Modus ist nicht mehr enthalten.

## Neue Bausteine

- `useCountdown` berechnet Tage, Stunden, Minuten und Sekunden.
- `useTripMode` steuert Vorfreude, Urlaub und Rückblick.
- Countdown- und Moduswechsel verwenden kurze, reduzierte Animationen und
  respektieren `prefers-reduced-motion`.

## Abgrenzung zu Phase 5

Phase 4 rief noch keine Wetter-API ab. Seit Phase 5 ergänzt ein
Open-Meteo-Provider Lade-, Fehler-, Aktualisierungs- und Cachelogik. Die
Resortdaten werden inzwischen über `status.live` geladen.
