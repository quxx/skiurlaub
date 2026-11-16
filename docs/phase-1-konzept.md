# Phase 1 – Konzept für SkiTrip 2027

Stand: 4. November 2026

## Entscheidung in einem Satz

SkiTrip 2027 wird als statische React-/TypeScript-Anwendung mit Vite,
Tailwind CSS und Lucide gebaut. Open-Meteo wird zunächst direkt im Browser
angebunden. Ein Cloudflare Worker kommt erst hinzu, wenn ein autorisierter
Lift-/Pistenfeed, geheime Zugangsdaten, CORS oder gemeinsames Caching ihn
tatsächlich erforderlich machen.

## 1. Produktidee und Betriebsmodi

Die Anwendung ist keine klassische Tourismusseite, sondern eine persönliche
Ski-App mit drei zeitabhängigen Modi:

1. **Vorfreude** – bis 10. Januar 2027, 00:00 Uhr in Europe/Vienna. Der
   Countdown, die Reisevorfreude und der Wettertrend zum Reisebeginn stehen im
   Mittelpunkt. Aktuelle Liftwerte sind zweitrangig und werden nicht als
   Reiseprognose missverstanden.
2. **Skiurlaub** – vom Start bis zu einem noch zu konfigurierenden Enddatum.
   Live-Wetter, offizieller Schneebericht, Lifte und Pisten rücken vor den
   Countdown. Der Hero begrüßt mit „It's Ski Time!“.
3. **Erinnerung** – nach dem Enddatum. Rückblick, Reisedaten und Links bleiben
   erhalten; Live-Polling wird reduziert oder beendet.

Der Modus wird ausschließlich aus der aktuellen Zeit und der Konfiguration
abgeleitet. Es gibt keinen manuell gespeicherten Modus, der veralten könnte.

```ts
type TripMode = 'anticipation' | 'onTrip' | 'afterTrip';

type TripConfig = {
  destination: 'Hochkrimml';
  timeZone: 'Europe/Vienna';
  startsAt: '2027-01-10T00:00:00+01:00';
  endsAt?: string; // wird ergänzt, sobald das Abreisedatum feststeht
};
```

Für die Differenzberechnung wird der ISO-Zeitpunkt in einen absoluten
Zeitstempel umgewandelt. Die Anzeige nutzt `Intl.DateTimeFormat` mit
`Europe/Vienna`. Werte werden bei null gekappt, sodass der Countdown nie
negativ wird.

## 2. Technologiewahl

| Option | Bewertung | Entscheidung |
| --- | --- | --- |
| React + TypeScript + Vite | Sehr guter Fit für zustandsabhängige Karten, Polling und spätere Erweiterungen; schlanker Build | **Gewählt** |
| Angular | Technisch geeignet, für ein persönliches Single-Dashboard aber unnötig schwer | Nicht gewählt |
| Vanilla TypeScript | Für einen Prototyp möglich; bei Datenzuständen, Modi und wiederverwendbaren Karten schnell unübersichtlich | Nicht gewählt |

Vorgesehene Laufzeit-Abhängigkeiten:

- `react` und `react-dom`
- `lucide-react` für konsistente, zugängliche Icons
- Tailwind CSS für das Designsystem und responsive Layout

Diagramme werden zunächst als kleine, semantische SVG-Komponenten umgesetzt.
Eine Chart-Library ist für eine einzelne Schneefallkurve nicht notwendig.
Ebenso sind Redux, Zustand und eine große UI-Library in der ersten Version
nicht erforderlich. Datenabruf, Cache und Stale-Status bleiben in einem
kleinen, getesteten Data-Layer.

## 3. Verifizierte Datenquellen

### Open-Meteo – Wetter und Modellprognose

**Geeignet für:** aktuelle und gefühlte Temperatur, Wettercode, Wind und Böen,
Niederschlagswahrscheinlichkeit, stündlichen/prognostizierten Schneefall,
Sonnenauf- und -untergang sowie eine 7-Tage-Prognose.

Geplanter Standort für die erste Version:

- Hochkrimml: ca. `47.23678, 12.12685`, Ortshöhe ca. 1.694 m
- optionaler Bergpunkt: Plattenkogel, ca. 2.040 m; vor Implementierung wird der
  genaue Punkt noch gegen eine offizielle Karte geprüft

Die Forecast API ist öffentlich dokumentiert. Ein API-Schlüssel ist für die
kostenlose, nichtkommerzielle Nutzung nicht erforderlich. Laut Anbieter gelten
für den Free-Tier unter anderem 10.000 Aufrufe pro Tag und eine Pflicht zur
Namensnennung unter CC BY 4.0. Die kommerzielle Nutzung benötigt einen
entsprechenden Tarif. Browserabrufe sind für die erste private Version
ausreichend; der Worker ist dafür kein Muss.

Wichtig: `snowfall` und `snow_depth` sind **meteorologische Modellwerte**. Sie
werden als „Wettermodell / Prognose“ beschriftet und niemals als offizielle
Schneehöhe des Skigebiets ausgegeben. Für Berg-/Talwetter werden getrennte
Koordinaten beziehungsweise Höhen verwendet; eine einfache, selbst erfundene
Temperaturkorrektur wird nicht vorgenommen.

Empfohlenes Abrufintervall: 30 Minuten mit Browser-Cache und dem letzten
erfolgreichen Ergebnis als Fallback. Häufigeres Polling erzeugt keine sinnvoll
frischere Modellprognose.

### Zillertal Arena – offizieller Schnee-, Lift- und Pistenbericht

Die offizielle Website veröffentlicht aktuell:

- geöffnete Anlagen und Pistenkilometer für das gesamte Gebiet,
- Schnee- und Neuschneehöhen nach Teilgebiet,
- einen eigenen Abschnitt für Hochkrimml mit Berg, Tal und Ort,
- die Aufteilung der offenen Anlagen nach Liftart,
- Zeitstempel des jeweils letzten Stands.

Die offizielle Zillertal-Arena-App wirbt ebenfalls mit Live-Daten der
Liftbetreiber. Die Zillertal-Arena-Datenschutzerklärung nennt Intermaps als
Dienst für geöffnete Pisten und Lifte. Daraus folgt jedoch **keine öffentliche
oder frei nutzbare API**. In der offiziellen Dokumentation wurde keine
Entwickler-API mit Nutzungsbedingungen gefunden.

Konsequenz für die Umsetzung:

1. In Version 1 zeigt die App einen klaren Link zum offiziellen Schneebericht.
2. Karten für Schnee, Pisten und Lifte verwenden bis zur Freigabe den Zustand
   `unavailable`, nicht aus dem HTML gelesene oder erfundene Werte.
3. Parallel wird Zillertal Arena beziehungsweise Intermaps nach einem
   autorisierten JSON/XML-Feed, Lizenzbedingungen, Gebietsschlüsseln für
   Hochkrimml/Gerlosplatte und Aktualisierungsintervallen gefragt.
4. Erst bei positivem Ergebnis wird der Feed über einen Cloudflare Worker
   normalisiert und gecacht. Zugangsdaten bleiben ausschließlich im Worker.

Nicht empfohlen sind Reverse Engineering der App, undokumentierte Endpunkte
oder fragiles HTML-Scraping. Ein Drittanbieter, der Betreiberseiten regelmäßig
ausliest, kann höchstens später nach rechtlicher und technischer Prüfung als
explizit gekennzeichneter Fallback dienen, nicht als primäre Datenquelle.

### Webcams

Die offizielle Livecam-Seite enthält Kameras für Krimml-Hochkrimml und
Gerlosplatte. Laut Datenschutzerklärung kommen die Einbettungen unter anderem
von Feratel und Panomax. Ein vorhandenes iframe ist noch keine Erlaubnis zur
erneuten Einbettung in einer anderen Website; außerdem können Consent,
Cookies, CSP und Anbieterbedingungen relevant sein.

Version 1 zeigt daher Vorschaukarten ohne fremdes Livebild und öffnet die
offizielle Livecam-Seite in einem neuen Tab. Eine direkte Einbettung folgt nur,
wenn ein offizieller Embed-Code und dessen Nutzungsbedingungen dies erlauben.

## 4. Datenvertrag und Wahrheitsprinzip

Jede Karte führt Quelle, Datenart, Aktualisierungszeit und Zustand mit:

```ts
type DataKind = 'live-report' | 'model-forecast' | 'static';
type Freshness = 'fresh' | 'stale' | 'unavailable';

type DataEnvelope<T> = {
  data: T | null;
  kind: DataKind;
  sourceName: string;
  sourceUrl: string;
  observedAt: string | null;
  fetchedAt: string | null;
  freshness: Freshness;
};
```

Regeln:

- `observedAt` ist der Zeitstempel der Quelle, `fetchedAt` der Abruf der App.
- Ein altes, zuletzt erfolgreich geladenes Ergebnis bleibt sichtbar, erhält
  aber das Badge „Veraltet“.
- Ohne verlässlichen Wert erscheint „Keine Daten verfügbar“.
- Ein Wettermodell darf niemals eine offizielle Resortmeldung ersetzen.
- Demo-/Mockdaten sind nur in Entwicklung erlaubt und immer mit „Demo“
  markiert; der Produktionsbuild erhält keine scheinbaren Live-Mockwerte.

## 5. Dashboard-Konzept

### Visuelle Richtung

- Hintergrund: `#07111F` (Midnight Navy)
- Flächen: Weiß mit 6–10 % Deckkraft und feiner heller Kontur
- Primärakzent: `#79D7E8` (Eisblau)
- Sekundärakzent: `#2DD4BF` (Türkis)
- Schneeweiß: `#F7FBFF`
- Warnung/veraltet: warmes Amber statt aggressivem Rot
- Typografie: variable Systemschrift; große, ruhige Ziffern mit tabellarischen
  Zahlen für Countdown und Messwerte

Glassmorphism wird sparsam auf Karten eingesetzt. Kontrast und Lesbarkeit haben
Vorrang vor Blur. Bewegungen werden über `prefers-reduced-motion` abschaltbar.

### Desktop

```text
┌──────────────────────────────────────────────────────────────────┐
│ Navigation                         Hochkrimml · Datenstatus      │
│                                                                  │
│ HOCHKRIMML 2027                                                │
│ The mountains are calling.        [ 66 | 06 | 42 | 18 ]         │
│                                    Tage  Std  Min  Sek           │
│                         Wettertrend zum Start / primäre Aktion   │
└──────────────────────────────────────────────────────────────────┘

┌──────────── Wetter ────────────┐ ┌──────── Offizieller Schnee ──┐
│ -4 °C · gefühlt -9 °C          │ │ Datenstatus / offizieller Link│
└────────────────────────────────┘ └───────────────────────────────┘
┌──────────── Pisten ────────────┐ ┌──────────── Lifte ────────────┐
│ Status + linearer Fortschritt  │ │ Status + kompakter Ring       │
└────────────────────────────────┘ └───────────────────────────────┘

┌──────────────── 7-Tage Skiwetter ───────────────────────────────┐
└──────────────────────────────────────────────────────────────────┘
┌──────── Modell: Neuschnee ─────┐ ┌──────── Live aus Hochkrimml ─┐
│ kleine SVG-Prognose            │ │ offizielle Webcam-Links      │
└────────────────────────────────┘ └───────────────────────────────┘
```

Im Urlaubsmodus wird das Bedingungen-Grid direkt in den oberen sichtbaren
Bereich gezogen. Countdown und Editorial-Text werden kleiner; Wetter, Lifte und
Pisten erhalten höhere visuelle Priorität.

### Mobile

- Einspaltiger Hero ohne Parallax-Zwang
- Countdown als kompaktes 2×2-Grid mit mindestens 44 px großen Touchzielen
- Bedingungen als horizontale Schnellübersicht, danach volle Karten
- 7-Tage-Prognose horizontal scrollbar mit sichtbarem Scroll-Hinweis
- sticky Statusleiste nur im Urlaubsmodus: Wetter, Wind, offizieller Bericht
- kein automatisch startendes Video und keine schwere Hintergrundanimation

## 6. Komponenten- und Modulstruktur

```text
src/
  app/
    App.tsx
    trip-config.ts
  components/
    hero/TripHero.tsx
    countdown/Countdown.tsx
    conditions/WeatherCard.tsx
    conditions/SnowReportCard.tsx
    conditions/PisteStatusCard.tsx
    conditions/LiftStatusCard.tsx
    forecast/ForecastStrip.tsx
    forecast/SnowfallChart.tsx
    webcams/WebcamLinks.tsx
    ui/DataBadge.tsx
    ui/Metric.tsx
    ui/StatusCard.tsx
  data/
    open-meteo/client.ts
    open-meteo/mapper.ts
    resort/provider.ts
    resort/unavailable-provider.ts
    cache.ts
  hooks/
    useCountdown.ts
    usePollingResource.ts
    useTripMode.ts
  types/
    data.ts
    weather.ts
    resort.ts
```

Das UI kennt keine API-Antwortformate. Mapper übersetzen externe Daten in
interne Typen. Der `ResortProvider` kann später von „nicht verfügbar“ auf einen
autorisierten Worker-Endpunkt umgestellt werden, ohne die Karten umzubauen.

## 7. Fehler-, Cache- und Aktualisierungskonzept

- Countdown: Aktualisierung pro Sekunde; Tab-Hintergrundphasen werden beim
  nächsten Tick aus `Date.now()` korrigiert statt hochgezählt.
- Wetter: 30 Minuten, `AbortController`, Timeout und begrenzter Retry.
- Offizieller Resortfeed: später gemäß Vertrag, voraussichtlich 5–15 Minuten;
  der Worker setzt Cache-Control und verhindert Anfrage-Spitzen.
- Letzter erfolgreicher Wetterstand: versioniert in `localStorage`, mit
  Ablaufzeit und Schema-Validierung beim Lesen.
- Ladezustand: Skeleton nur beim ersten Abruf. Bei Refresh bleibt der letzte
  Wert sichtbar und bekommt einen dezenten Aktualisierungsindikator.
- Offline/API-Ausfall: letzte Daten plus „zuletzt aktualisiert“; ohne Cache eine
  klare Fehlermeldung mit Link zur offiziellen Quelle.

## 8. Cloudflare-Architektur

### Phase A – ohne Worker

```text
Browser → statische React-App auf Cloudflare Pages
        → Open-Meteo Forecast API
        → offizielle Zillertal-Arena-Seiten als Links
```

Vorteile: keine Secrets, keine Serverwartung, praktisch keine Betriebskosten.

### Phase B – nur bei echtem Bedarf

```text
Browser → Cloudflare Static Assets
        → /api/resort (Worker, Cache, Validierung)
        → autorisierter Zillertal-Arena-/Intermaps-Feed
```

Der Worker ist gerechtfertigt, sobald mindestens einer dieser Punkte gilt:
geheimer Schlüssel, vertraglich erlaubter Server-to-Server-Zugriff, fehlendes
CORS, zentrale Rate-Limits oder Normalisierung mehrerer autorisierter Quellen.
Er wird nicht vorsorglich eingeführt.

## 9. Umsetzungsreihenfolge

1. **Design-Slice:** responsive Hero-, Countdown- und Karten-Shell mit klaren
   Zuständen für Laden, veraltet und nicht verfügbar.
2. **Echte Wetterdaten:** Open-Meteo-Adapter, Cache, Attributionszeile,
   7-Tage-Ansicht und Modell-Schneefall.
3. **Resortdaten-Entscheidung:** Antwort von Zillertal Arena/Intermaps prüfen;
   nur bei autorisiertem Feed Worker bauen.
4. **Webcams:** zunächst offizielle Links, danach optional genehmigte Embeds.
5. **Qualität:** Zeitzonen-, Fehlerfall-, Responsive- und Accessibility-Tests;
   anschließend Cloudflare-Deployment.

## 10. Offene, vor der Implementierung nötige Produktangaben

- Abreisedatum für den Urlaubs- und Erinnerungsmodus
- privat/nichtkommerziell bleibt die vorgesehene Nutzung (relevant für
  Open-Meteo-Lizenz)
- gewünschte Darstellung nur für die Gruppe oder öffentlich erreichbar
- Rückmeldung von Zillertal Arena/Intermaps zu einem autorisierten Datenfeed

Keiner dieser Punkte blockiert den nächsten Design-Slice; das Enddatum kann bis
dahin optional bleiben und Resortkarten können den korrekten
„Keine Daten verfügbar“-Zustand zeigen.

## Quellen

- Open-Meteo Forecast API: https://open-meteo.com/en/docs
- Open-Meteo Bedingungen und Limits: https://open-meteo.com/en/terms
- Open-Meteo Preise/kommerzielle Nutzung: https://open-meteo.com/en/pricing
- Offizieller Schneebericht: https://www.zillertalarena.com/info-service/livecams-wetter/schneebericht/
- Offizielle Livecams: https://www.zillertalarena.com/info-service/livecams-wetter/livecams/
- Zillertal-Arena-Datenschutz (Intermaps/Feratel/Panomax): https://www.zillertalarena.com/datenschutz/
