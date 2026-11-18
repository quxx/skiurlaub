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

## Wettermodell: GeoSphere Austria (seit 18.11.2026)

Die App fragt Open-Meteo jetzt zuerst mit `models=geosphere_seamless` ab (GeoSphere Austria, der
österreichische Wetterdienst: 1-km-Modell für die ersten Tage, danach ECMWF). Fällt diese Abfrage
aus, nutzt sie das Standardmodell von Open-Meteo (`best_match`, in Mitteleuropa ICON-D2/ICON-EU);
bei einem Rate Limit gibt es bewusst keinen zweiten Abruf. Implementiert in
`data/weather/open-meteo-provider.ts` (zwei Provider mit getrenntem Cache, `geosphere:v1` und `v4`),
getestet in `data/providers.test.ts`.

**Begründung (Vergleich mit echten Messwerten):** Messstation KRIMML der GeoSphere Austria (TAWES,
1009 m, 4,3 km von Hochkrimml) gegen Open-Meteo-Daten für 1009 m über die letzten 48 Stunden
(18.11.2026, 48 Stundenwerte):

| Modell                  | Temperatur, mittlere Abweichung | Bias     | Wind, mittlere Abweichung |
| ----------------------- | ------------------------------- | -------- | ------------------------- |
| best_match (= ICON-D2)  | 4,2 °C                          | +4,2 °C  | 6,0 km/h                  |
| ICON-EU                 | 5,2 °C                          | +5,2 °C  | 5,1 km/h                  |
| ECMWF IFS               | 2,9 °C                          | +2,8 °C  | 3,3 km/h                  |
| **GeoSphere Seamless**  | **1,1 °C**                      | −0,9 °C  | 3,8 km/h                  |
| AROME France HD         | 4,7 °C                          | +4,7 °C  | 3,1 km/h                  |

Einschränkungen: nur eine Talstation, nur 48 Stunden, nur Temperatur und Wind (keine Station
misst auf Pistenhöhe in der Nähe), Modellwerte mit kurzer Vorlaufzeit. Das ist ein Hinweis, kein
Beweis; bei kalter Talluft (Inversion) liegen Modelle oft zu warm. Ein Vergleich über längere
Zeit (z. B. mit den Hahnenkamm-Stationen auf 1.667–1.794 m, 26 km entfernt) wäre aussagekräftiger.

GeoSphere Seamless liefert alle von der App genutzten Werte für 7 Tage (Temperatur, gefühlt, Wetter,
Wind, Böen, Niederschlagswahrscheinlichkeit, Schneefall, Schneehöhe, Sonnenzeiten).

**Echte Messwerte:** Die offene TAWES-Schnittstelle der GeoSphere Austria
(`dataset.api.hub.geosphere.at`, CC BY 4.0) liefert gemessene Temperatur, Wind, Niederschlag, Feuchte,
Druck und Sonnenschein; die nächste Station ist KRIMML (Tal, 1009 m). Eine Schneehöhe ist im
10-Minuten-Datensatz nicht enthalten. Noch nicht angebunden.

**Anzeige:** Die Beschriftungen „Modellwetter/Modellprognose/Modellwerte“ wurden auf Wunsch aus der
Oberfläche entfernt. Die Quellenangabe bleibt (Open-Meteo, GeoSphere Austria, CC BY 4.0, unter
„Datenstand“ und „Datenquellen und Hinweise“); dort steht auch, dass die Schneehöhe berechnet und
nicht gemessen ist.
