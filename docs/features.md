# Phase 0: Ist-Zustand und Feature-Inventur

Prüfstand 17.11.2026. Basis: lokales `main`, Commit `6a3eab4`, Remote
`git@github.com:quxx/skiurlaub.git`; Arbeitsbaum vor Analyse sauber.
GitHub-Metadaten und `main/package.json` wurden über den Connector gelesen;
package.json stimmt mit lokal überein. Ein vollständiger Remote-Tree-Abgleich
wurde nicht durchgeführt; `origin/main` ist eine lokale Referenz.

## Tatsächlicher Bestand

Bereits React, TypeScript strict, Vite, Tailwind, Lucide und Leaflet.
`src/app/App.tsx` bindet Wetter-/Resort-Kontexte und eine einseitige Oberfläche ein.
`design-preview/` ist ein separater HTML/CSS/JS-Prototyp, nicht die laufende App.
Die alten Dokumente `phase-1-*` bis `phase-5-*` beschreiben eine andere Phasenfolge.
Die Aussage in `status-live-resortdaten.md` zur stilisierten Karte ist überholt:
aktuell verwendet `LiftMiniMap.tsx` eine geografische Leaflet-Karte.

| Funktion                            | Nachweis                                          | Stand / Einschränkung                                                              |
| ----------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Countdown                           | `useCountdown.ts`                                 | Sekunden, Begrenzung auf null, ungültige Daten werfen Fehler                       |
| Reisephasen                         | `useTripMode.ts`, `trip-config.ts`                | vor/während/nach Reise; Ende optional, ohne Ende dauerhaft Urlaubsmodus            |
| Reisekonfiguration                  | `.env.example`                                    | Start 10.01.2027, Europe/Vienna, Wetterkoordinaten; nur eine Reise                 |
| Tageswetter, 7 Tage, Stundendetails | Wetterprovider, `ForecastPreview.tsx`             | Open-Meteo, Lade-/Fehler-/Cachezustände, manuelles Neuladen                        |
| Schneedecke und Neuschnee           | Wetterprovider, Dashboard                         | Modellwerte; keine angebundene offizielle Berg-/Talschneehöhe                      |
| Lifte und Pisten                    | `status-live-provider.ts`                         | Arena-Summen, Einzelstatus, Pistenkilometer, Quellzeit, stale; Drittquelle         |
| Karte                               | `LiftMiniMap.tsx`                                 | Lifte, Pisten, Schwierigkeit, Status, Webcams, Arena-Tour und externe Karte        |
| Geometrien                          | `zillertal-arena-lifts.ts`, `liftradar-pistes.ts` | statische Liftgeometrien, zwei externe Gebietskacheln; gebietsspezifisch           |
| Statuszuordnung                     | LiftMiniMap/Arena-Tour                            | Aliasnamen und Pistennummern; keine garantierte eindeutige Identität               |
| Responsive Design                   | `styles/index.css`                                | dunkles Cyan-Design; kein persistentes Light/Dark/System-Theme                     |
| Cache / Aktualisierung              | beide Provider und Kontexte                       | localStorage, Wetter 30 Minuten Polling, Resort 15 Minuten; kein Offline-App-Shell |
| Navigation                          | Hero/Anker                                        | kein Router, keine fünf Hauptbereiche                                              |

Nicht vorhanden: Backend, SQL-Migrationen, Login, Gruppen, Skiline-Code oder
anonymisierte Skiline-Fixtures, Skipassverwaltung, persönliche Statistiken,
Rankings, IndexedDB-Queue, GPS, Capacitor/Android, APK-Updates, CI und Testsetup.
Ein `.wrangler`-Verzeichnis ist kein Nachweis eines versionierten Backends.

## Technische Befunde

Provider-Grenzen und `DataEnvelope` sind gute Migrationspunkte. Die externen
Antworten werden teilweise manuell geprüft; insbesondere Geometrieantworten
werden typisiert gecastet. Zod und Schema-Versionen fehlen. Kartenlogik und
gebietsspezifische Konfiguration sind stark in einer großen Komponente gebündelt.
Fehlerhafte Konfiguration, null-Antworten, DST-Wechsel und mehrdeutige Zuordnungen
brauchen Tests. Bilddateien liegen teils mehrfach vor (Hero jeweils etwa 2,4 MB).

Keine Browser-, Geräte- oder Live-Endpunkt-Funktionstests in Phase 0 erfolgt.
Vorhandene Funktionen sind aus dem Code inventarisiert, nicht als produktiv
verifiziert zertifiziert. Keine Abhängigkeiten geändert oder neu installiert.
