# Phase 5 – Open-Meteo-Wetterdaten

Stand: 4. November 2026

## Ergebnis

Aktuelles Modellwetter und die 7-Tage-Prognose werden direkt aus der
öffentlichen Open-Meteo Forecast API geladen. Die Darstellung unterscheidet
klar zwischen Wettermodell und offiziellen Resortmeldungen.

## Abgerufene Wetterwerte

- aktuelle und gefühlte Temperatur
- aktuelle modellierte Schneedecke am Standort in Zentimetern
- Wettercode nach WMO
- Windgeschwindigkeit und Böen in km/h
- tägliche Minimal- und Maximaltemperatur
- prognostizierter Schneefall in Zentimetern
- maximale Niederschlagswahrscheinlichkeit
- Sonnenauf- und Sonnenuntergang
- 168 Stundenwerte für Temperatur, Wettercode, Wind, Niederschlagswahrscheinlichkeit und Schneefall

Die Anfrage verwendet die Hochkrimml-Koordinaten aus `trip-config.ts`, eine
Höhe von 1.694 Metern, sieben Prognosetage und `Europe/Vienna` als Zeitzone.

## Interaktive Stundenansicht

Die sieben Tageskarten sind auswählbar. Ein Klick öffnet direkt unter dem
Tagesstreifen eine Stundenübersicht für den gewählten Tag. Sie enthält:

- 24 stündliche Wetterzustände mit Icon und Temperatur
- Windgeschwindigkeit und Niederschlagswahrscheinlichkeit
- ein gemeinsames Balkendiagramm für den prognostizierten Schneefall pro Stunde
- die summierte modellierte Neuschneemenge des gewählten Tages

Ein erneuter Klick auf den aktiven Tag oder der Schließen-Button klappt die
Ansicht wieder ein. Die Stundenreihe ist horizontal scrollbar und per
Tastatur bedienbar.

## Zustände und Cache

| Zustand | Darstellung |
| --- | --- |
| Laden | Badge „Lädt“ und neutrale Platzhalter |
| Erfolgreich | Badge „Aktuell“ und Open-Meteo-Attribution |
| Fehler mit Cache | letzte Werte bleiben sichtbar, Badge „Veraltet“ |
| Fehler ohne Cache | „Nicht verfügbar“ und erneuter Ladeversuch |

Erfolgreiche Antworten werden 30 Minuten in `localStorage` gespeichert. Ein
erneuter Abruf erfolgt danach automatisch sowie bei wiederhergestellter
Netzwerkverbindung. Nach dem Reiseende stoppt das regelmäßige Polling.

## Architektur

- `open-meteo-provider.ts` baut die Anfrage, validiert und normalisiert die
  Antwort und verwaltet den Cache.
- `WeatherDataProvider.tsx` stellt einen gemeinsamen React-Zustand bereit,
  damit Hero, aktuelle Bedingungen und Prognose nur eine Anfrage verwenden.
- `weather-code.ts` übersetzt numerische WMO-Codes in deutsche Bezeichnungen
  und passende Lucide-Icons.
- Die UI verarbeitet `fresh`, `stale` und fehlende Daten ausdrücklich.

## Datenwahrheit

Open-Meteo-Werte sind Modell- beziehungsweise Prognosedaten und keine
offiziellen Mess- oder Betriebswerte der Zillertal Arena. Die Schneekarte zeigt
deshalb ausdrücklich die **modellierte Schneedecke am Standort auf 1.694 m**.
Sie ist keine gemessene Berg- oder Talschneehöhe des Skigebiets. Der Link zum
offiziellen Schneebericht bleibt direkt an der Karte verfügbar.

Quelle: [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
