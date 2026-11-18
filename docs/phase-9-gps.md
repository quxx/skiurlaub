# GPS-Tracking (vorgezogene Phase 9)

Stand 18.11.2026. Phase 5 wurde gestrichen, GPS rückt nach Phase 4. **Veröffentlicht am 18.11.2026**
(Migrationen 0003–0005, Worker-Version `c2d40062`). Gruppenfreigabe gibt es noch nicht (Phase 7); Tracks sind nur für den Besitzer
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

- Migrationen `0004` + `0005_gps_tracks_text.sql`: `gps_tracks` (Metadaten, `data_b64` TEXT ≤ 1,4 Mio.
  Zeichen = komprimierter Track als Base64, Statistik-JSON, Revision), Eindeutigkeit
  `UNIQUE(user_id, client_track_id)`. 0005 hat die Tabelle von BLOB mit Checksumme auf Text umgebaut
  (siehe CPU-Befund).
- `PUT /gps-tracks/:clientId` (idempotent, Revision nur bei geändertem Inhalt, 30 Uploads/h),
  `GET /gps-tracks`, `GET /gps-tracks/:id/data` (JSON `{ data }`, nur eigene), `DELETE`.
- **Der Server entpackt nichts.** Er prüft Größe, Gzip-Kennung (`H4sI…`) und Zeichensatz und speichert
  den Track unverändert. Punktzahl und Statistik stammen vom Gerät (`stats_source = client`).
  Wer einen Track später liest (heute der Besitzer, später Gruppenmitglieder), muss ihn mit dem
  begrenzten Codec defensiv dekodieren.

## Erweiterte Auswertung (Höhenprofil, Liftzuordnung, Route auf der Skikarte)

- **Höhenprofil** (`components/track/ElevationChart.tsx`, eigenes SVG ohne Zusatzbibliothek): Höhe über
  die Zeit, Abschnitte farbig (Lift / Abfahrt / Flach / Pause), antippen oder ziehen wählt einen Abschnitt.
- **Route auf der Skikarte:** Die bestehende `LiftMiniMap` zeigt die Route über Liften, Pisten und
  Livecams (`track`-Prop, weißer Rand, gewählter Abschnitt hervorgehoben, einmaliges Einpassen).
- **Liftzuordnung** (`packages/gps/src/match.ts`): Eine Liftfahrt wird dem Lift zugeordnet, dessen
  Stationen zu Start/Ende der Fahrt passen und dessen Linie nah am Track liegt. Sicherheit „hoch“
  nur, wenn kein anderer Lift ähnlich gut passt (parallele Lifte ≈ 45 m daneben gelten als
  Alternative). Ohne Treffer: „keinem bekannten Lift zugeordnet“. Datenquelle: die schon im Repo
  liegenden statischen Lift-Endpunkte aus OpenStreetMap/OpenSkiData (ODbL).
- Abschnittsliste mit Uhrzeit, Dauer, Höhenmetern und Distanz; Auswahl in Diagramm, Karte und Liste
  ist verknüpft.
- **Pistenzuordnung** (`packages/gps/src/match-pistes.ts`): Eine Abfahrt wird in Stücke nach befahrener Piste zerlegt (mehrere Pisten nacheinander möglich, Reihenfolge, Zeitraum, Farbe). Mehrere OSM-Wege derselben Piste zählen als eine; bei übereinanderliegenden Pisten bleibt die aktuelle Piste gewählt (keine Zickzack-Zuordnung), die Sicherheit sinkt auf „wahrscheinlich“ samt Alternative; ohne Treffer: „abseits bekannter Pisten“. Korridor 45 m, experimentell.
- **Pistendaten: LiftRadar (Nutzerentscheidung 18.11.2026, Rechtslage geklärt).** Laut der
  [LiftRadar-API-Seite](https://liftradar.eu/de/api) (Stand 18.11.2026) sind die Daten „frei als JSON lesbar,
  ohne Schlüssel und ohne Anmeldung“; die von uns genutzten Kacheln `/ski/v1/10/<x>/<y>.json` sind dort
  dokumentiert und stehen unter der **ODbL**. Auflagen: **Quellenangabe** („Daten von OpenSkiData,
  © OpenStreetMap-Mitwirkende“; in der Karte als Attribution und im Hinweistext der Detailseite umgesetzt)
  und Rücksicht beim Abruf (Aktualisierung zweimal täglich, Kacheln wöchentlich neu gebaut, öfter als
  stündlich abzufragen bringt nichts). Die Kacheln (je ca. 80 KB) kommen mit `Cache-Control: max-age=604800`
  und ETag; der WebView-Cache hält sie eine Woche, und `loadZillertalArenaPistes` teilt sich pro Sitzung einen
  Abruf zwischen Karte und Auswertung. Offen bleibt nur, dass die Seite gewerbliche Nutzung nicht ausdrücklich
  regelt (hier privat, kostenlos) und LiftRadar um Mitteilung bittet, wenn man die Daten nutzt
  (Kontakt auf der Seite).
- Geprüft: `match-pistes.test.ts` (5 Tests: zwei Pisten nacheinander, mehrere Wege einer Piste, übereinanderliegende Pisten, keine Piste, Toleranz), `match.test.ts` (5 Tests: richtiger Lift, Stationen vertauscht, Zwillingslift,
  kein Lift in der Nähe, nur eine Station passt), `ElevationChart.test.tsx` (3 Tests). Auf dem Samsung
  mit **synthetischen** Aufzeichnungen entlang echter Gondeln („Dorfbahn Gerlos I/II“) und echter
  Pistenlinien („Skiweg Zell am Ziller“ → „Piste 10 Talabfahrt“): Profil, Route auf der Karte, Lifte und
  Pisten richtig benannt; eine Piste außerhalb der App-Liste wird korrekt als „abseits bekannter Pisten“ angezeigt. Das ist kein Beweis für die Genauigkeit auf einem
  echten Skitag.

## Geprüft

- `packages/gps` 19 Tests, API 39 Tests (8 neue für Tracks: Anmeldung, Upload/Roundtrip,
  Idempotenz/Revision, ungültige Daten inkl. Zip-Bombe, Größen, **Nutzertrennung**, Rate Limit,
  DB-Regeln), App 65 Tests, 18 Oberflächentests; Typecheck, Lint, Format grün.
- **Auf dem Samsung (SM-S918B):** Zustimmung → echter Berechtigungsdialog → Aufzeichnung startet,
  Punkte kommen mit ±11 m, Intervall passt sich im Stillstand an, Pause/Fortsetzen/Beenden, mit
  **gesperrtem Display** weiter Punkte (6 Punkte in ca. 100 s bei 10-s-Intervall, siehe unten),
  Dienst als Foreground-Service vom Typ Standort aktiv, Detailseite mit Warnung „zu wenige Punkte“,
  Route auf der Karte.
- **Upload live getestet** (Produktion, echte Google-Anmeldung): hochladen, Liste, Server-Kopie löschen,
  erneut hochladen (idempotent) funktionierte.

## Nicht geprüft / bekannte Einschränkungen

- **Kein echter Skitag, kein Akkutest.** Plan und Messvorlage: [gps-battery-test.md](gps-battery-test.md).
- Bei gesperrtem Display im Haus kamen weniger Punkte als angefordert (Batching, Stillstand);
  auf der Piste zu prüfen.
- **Worker-CPU (Free-Plan: 10 ms pro Anfrage), gemessen im Live-Log (`wrangler tail`):** Die erste
  Variante (Entpacken + Dekodieren + SHA-256 auf dem Server) kostete schon für einen 19-Punkte-Track
  8 ms. Nach dem Umbau (0005, nichts wird entpackt): Upload **2 ms** warm, 6 ms beim ersten Aufruf
  nach dem Deploy; Liste/Löschen 0–1 ms. Gemessen nur mit einem sehr kleinen Track; ein echter
  8-h-Track (Base64 ca. 50–100 KB) kostet zusätzlich JSON-Parse und DB-Bind und ist erst mit einem
  echten Skitag zu bestätigen.
- Pistenzuordnung ist umgesetzt (siehe oben); die Intermaps-Pistenkarte wird nicht verwendet. Segmente sind rein bewegungsbasiert und mit Qualitätsangabe.
- Samsung „Schlafende Apps“/Akku-Optimierung können den Dienst beenden; Hinweis in der App fehlt noch.
- Auswertung läuft nur auf dem Gerät; der Upload speichert Rohdaten + dort berechnete Werte.
- Ein Test-Track mit echtem Standort liegt auf dem Handy (in der App löschbar).

## Deployment

Erledigt am 18.11.2026: `wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc` (0003 bis 0005, 0005 ersetzte die Tabelle `gps_tracks` samt einer Test-Zeile) und `wrangler deploy --config wrangler.production.jsonc`.
