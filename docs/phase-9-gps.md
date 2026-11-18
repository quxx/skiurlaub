# GPS-Tracking (vorgezogene Phase 9)

Stand 18.11.2026. Phase 5 wurde gestrichen, GPS rückt nach Phase 4. **Nicht committet, nicht
veröffentlicht.** Gruppenfreigabe gibt es noch nicht (Phase 7); Tracks sind nur für den Besitzer
sichtbar. Das Modul ist optional und startet nie von selbst.

Entscheidungen des Nutzers: Upload gleich dabei (komprimiert in D1, kein neuer Dienst);
Akkubudget **15–20 Prozentpunkte zusätzlich über 8 h Skitag** (Richtwert, keine Garantie).

## Bestandteile

### `packages/gps` (`@skiurlaub/gps`, reine Logik, 19 Tests)

| Datei          | Inhalt                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clean.ts`     | Punktvalidierung: ungültige Koordinaten, Null Island, Zeit doppelt/rückwärts, Genauigkeit, Geschwindigkeitssprünge (mit Neu-Ausrichtung nach 5 Sprüngen) |
| `altitude.ts`  | Höhe: Barometer + GPS (Komplementärfilter) bzw. GPS mit Median/Glättung; Höhenmeter mit Totband                                                          |
| `analyze.ts`   | Glättung, Kinematik, Segmente Lift / Abfahrt / Flach / Pause (Hysterese, Mindestdauern), Statistik, Qualität                                             |
| `codec.ts`     | Versioniertes Binärformat (Delta + Varint) + gzip; Größen- und Punktgrenzen gegen Zip-Bomben                                                             |
| `synthetic.ts` | Synthetische Skitage für Tests                                                                                                                           |

Alle Schwellwerte (`defaultGpsConfig`) sind **experimentell**, an synthetischen Strecken abgestimmt
und müssen an echten Skitagen geprüft werden. Auf idealisierten Strecken (3 Runden, 900 m Anstieg):
mit Barometer 895–900 m, nur GPS 856–871 m; Strecke ±4 %; Qualität sinkt mit der GPS-Genauigkeit.

Primäre Größe „Höhenmeter“ = Summe der Anstiege **in Lift-Segmenten** (vergleichbar mit
Skiline-Höhenmetern); zusätzlich Abfahrtshöhenmeter. Werte sind als „GPS · berechnet“ gekennzeichnet
und werden nie mit Skiline-Werten vermischt.

### Android (nativ, `apps/mobile/android`)

- `GpsTrackingService`: Foreground-Service (Typ `location`), sichtbare Dauer-Benachrichtigung mit
  Pause/Fortsetzen/Beenden, Fused Location Provider, Priorität hoch, **adaptive Intervalle**
  (5 s in Bewegung, 10 s langsam, 30 s im Stillstand; Hysterese), Batching (2× Intervall),
  Barometer (`TYPE_PRESSURE`), MSL-Höhe ab Android 14 (eine Höhenreferenz pro Track).
  Keine Hintergrundstandort-Berechtigung nötig (Start nur bei sichtbarer App).
- `TrackStore`: append-only JSON-Lines pro Track in app-privatem Speicher, Meta-Datei atomar
  ersetzt; ein abgebrochener Prozess verliert höchstens die letzte Zeile. IDs werden als UUID
  geprüft (kein Path Traversal).
- `SkiurlaubGpsPlugin`: Berechtigungen, `start` nur mit `consent: true`, Pause/Fortsetzen/Stopp,
  Liste, Lesen, Löschen. Bei Prozess-Tod während einer Aufnahme setzt der Dienst fort (nur eine vom
  Nutzer gestartete Aufnahme); verbietet Android den Start aus dem Hintergrund, wird der Track als
  „unterbrochen“ markiert, die Punkte bleiben erhalten.
- Native Plugin-Positivliste für die API um `GET /gps-tracks`, `PUT/DELETE /gps-tracks/<uuid>` erweitert.

### App

Skitage-Tab: Zustimmungstext vor dem ersten Start, Aufnahme-Karte (Start/Pause/Fortsetzen/Beenden,
Live-Werte), Liste der Aufzeichnungen, Detailseite mit Auswertung, Warnungen, Abschnitten, Karte
(OSM-Kacheln nur bei Anzeige, kein Vorladen), Löschen und **optionaler Upload**.

### Backend

- Migration `0004_gps_tracks.sql`: `gps_tracks` (Metadaten, `data` BLOB ≤ 1 MB, Checksumme,
  Statistik-JSON, Revision), Eindeutigkeit `UNIQUE(user_id, client_track_id)`.
- `PUT /gps-tracks/:clientId` (idempotent, Revision nur bei geändertem Inhalt, 30 Uploads/h),
  `GET /gps-tracks`, `GET /gps-tracks/:id/data` (Rohdaten, nur eigene), `DELETE`.
- Der Server prüft das Format durch begrenztes Entpacken und gleicht die Punktzahl ab. Die
  Statistik stammt vom Gerät (`stats_source = client`); der Worker rechnet sie nicht nach.

## Geprüft

- `packages/gps` 19 Tests, API 39 Tests (8 neue für Tracks: Anmeldung, Upload/Roundtrip,
  Idempotenz/Revision, ungültige Daten inkl. Zip-Bombe, Größen, **Nutzertrennung**, Rate Limit,
  DB-Regeln), App 65 Tests, 18 Oberflächentests; Typecheck, Lint, Format grün.
- **Auf dem Samsung (SM-S918B):** Zustimmung → echter Berechtigungsdialog → Aufzeichnung startet,
  Punkte kommen mit ±11 m, Intervall passt sich im Stillstand an, Pause/Fortsetzen/Beenden, mit
  **gesperrtem Display** weiter Punkte (6 Punkte in ca. 100 s bei 10-s-Intervall, siehe unten),
  Dienst als Foreground-Service vom Typ Standort aktiv, Detailseite mit Warnung „zu wenige Punkte“,
  Route auf der Karte.

## Nicht geprüft / bekannte Einschränkungen

- **Kein echter Skitag, kein Akkutest.** Plan und Messvorlage: [gps-battery-test.md](gps-battery-test.md).
- Bei gesperrtem Display im Haus kamen weniger Punkte als angefordert (Batching, Stillstand);
  auf der Piste zu prüfen.
- Der **Upload ist am Gerät nicht getestet** (Produktions-Server hat die Migration noch nicht;
  ein lokaler Test würde die echte Anmeldung im Keystore löschen). Nach dem Deploy mit echter
  Anmeldung testen.
- **Worker-CPU:** Entpacken + Prüfen eines Tracks läuft in Miniflare ohne CPU-Limit. Der Free-Plan
  erlaubt 10 ms CPU pro Anfrage; bei einem 8-h-Track kann das knapp werden. Nach dem Deploy mit
  einem langen Track messen; Notfalls Prüfung auf Kopfdaten reduzieren.
- Pistenerkennung (Zuordnung zu Pisten) fehlt: Lizenz der Pistendaten ungeklärt (OSM/ODbL, LiftRadar,
  Intermaps). Segmente sind rein bewegungsbasiert und mit Qualitätsangabe.
- Samsung „Schlafende Apps“/Akku-Optimierung können den Dienst beenden; Hinweis in der App fehlt noch.
- Auswertung läuft nur auf dem Gerät; der Upload speichert Rohdaten + dort berechnete Werte.
- Ein Test-Track mit echtem Standort liegt auf dem Handy (in der App löschbar).

## Deployment (nach Freigabe)

`wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc` (Migrationen 0003 und 0004) und `wrangler deploy --config wrangler.production.jsonc`.
