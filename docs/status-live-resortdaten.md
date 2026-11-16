# Lift- und Pistenstatus über status.live

Stand: 4. November 2026

## Ergebnis

Die Lift- und Pistenkarten laden gemeldete Betriebszustände für die gesamte
Zillertal Arena über die öffentliche `status.live`-API. Die Anwendung stellt
diese Werte ausdrücklich nicht als offiziellen Resort-Feed dar.

Verwendeter Endpunkt:

```text
https://status.live/api/v1/ski/resorts/zillertal-arena
```

## Angezeigte Daten

- Anzahl geöffneter und insgesamt gemeldeter Lifte
- Einzelstatus und Namen der gemeldeten Lifte
- geöffnete und gesamte Pistenkilometer
- prozentualer Öffnungsstand
- Zeitpunkt des Quellstands
- Aktualitätszustand `fresh`, `stale` oder nicht verfügbar

Die Summenwerte beziehen sich auf die gesamte Zillertal Arena. Die Liftkarte
orientiert sich am offiziellen Pistenplan und zeigt einen stilisierten
Hochkrimml-Ausschnitt mit Plattenkogel, Duxeralm, Filzstein, Handlalm und der
Verbindung in Richtung Königsleiten. Eingezeichnet sind die elf offiziell für
Hochkrimml aufgeführten Anlagen. Da die API keine Geokoordinaten der Anlagen
liefert, bleibt die Darstellung bewusst ein vereinfachtes Panorama und keine
geografisch exakte Pistenkarte. Farbe und Tooltip verwenden den gemeldeten
Einzelstatus; nicht eindeutig zuordenbare Namen werden neutral dargestellt.

## Cache und Fehlerverhalten

- Erfolgreiche Antworten werden 15 Minuten in `localStorage` gespeichert.
- Nach Ablauf des Caches und bei wiederhergestellter Netzwerkverbindung wird
  erneut geladen.
- Bei einem Fehler bleibt ein vorhandener Wert sichtbar und erhält das Badge
  „Veraltet“.
- Ohne Cache erscheinen keine erfundenen Werte.
- Nach dem Reiseende stoppt das regelmäßige Polling.

## Datenwahrheit und Attribution

Jede Darstellung verlinkt sichtbar auf `status.live`. Die Anwendung weist
darauf hin, dass Sperren, Schilder und offizielle Anzeigen vor Ort maßgeblich
sind. `status.live` ist für dieses persönliche, nichtkommerzielle Dashboard
nutzbar; eine kommerzielle Verwendung würde eine Lizenz erfordern.

Die von `status.live` angebotenen modellierten Schneewerte werden nicht als
Resort-Schneehöhe verwendet. Die Schneehöhenkarte bleibt bis zu einer
offiziellen oder ausdrücklich autorisierten Quelle unverändert.

Quellen:

- [status.live – Zillertal Arena](https://status.live/ski/zillertal-arena)
- [Offizieller Pistenplan und Liftliste](https://www.zillertalarena.com/winter/skigebiet/lifte-pisten/)
- [status.live API](https://status.live/api)
- [status.live Nutzungsbedingungen](https://status.live/terms)
