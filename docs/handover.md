# Übergabe / Arbeitsprotokoll (Codex ⇄ Claude Code)

Zweck: Wer als Nächstes weiterarbeitet (Codex oder Claude Code), findet hier den
tatsächlichen Stand, ohne den Chatverlauf zu brauchen. Neueste Einträge oben.
Maßgebliche Vorgaben bleiben der Master-Prompt (Phasen 0–11, immer nur eine
Phase, danach Review/Freigabe) und die Dokumente in `docs/`.

## Eintrag 2026-11-18 (11) – Claude Code: Wettermodell GeoSphere, "Modell"-Texte entfernt

Auf Nutzerwunsch: genauere Wetterwerte und Streichen aller "Modellprognose/Modellwetter"-Beschriftungen. Open-Meteo wird jetzt mit `models=geosphere_seamless` abgefragt (Fallback Standardmodell; kein zweiter Abruf bei Rate Limit). Begründung: 48-h-Vergleich mit der GeoSphere-Station Krimml (Temperatur-Abweichung 1,1 °C statt 4,2 °C beim bisherigen Standardmodell; nur eine Talstation, siehe docs/phase-5-wetterdaten.md). Dabei Fehler in `remote.ts` behoben: Beim Weiterreichen eines Fehlers ohne Cache ging `retryAt` verloren. UI-Texte angepasst (Quellenangabe CC BY bleibt). App 71 Tests. Nicht committet.

## Eintrag 2026-11-18 (10) – Claude Code: LiftRadar-Nutzung bestätigt

Der Nutzer verwies auf https://liftradar.eu/de/api; gelesen: Daten frei lesbar ohne Schlüssel, unsere Kachel-URLs (`/ski/v1/10/<x>/<y>.json`) dokumentiert, Kacheldaten ODbL, Quellenangabe nötig, Abruf wöchentlich/stündlich genügt, Kacheln mit 7 Tage Cache und ETag. Umgesetzt: Attribution „Pisten & Lifte: LiftRadar, OpenSkiData“ in der Leaflet-Karte (`LiftMiniMap.tsx`) und angepasster Hinweistext in `TrackDetailPage.tsx`; Doku (phase-9-gps.md, phase-2-dashboard.md) von „ungeklärt“ auf „erlaubt mit Auflagen“ geändert. Offen/optional: LiftRadar über die Nutzung informieren (Kontakt auf der Seite). Nicht committet.

## Eintrag 2026-11-18 (9) – Claude Code: Pistenzuordnung (Weg 2: LiftRadar-Quelle)

Nutzerentscheidung: bestehende LiftRadar-Pistendaten verwenden (Rechtslage ungeklärt, siehe phase-9-gps.md). Neu: `packages/gps/src/match-pistes.ts` (+5 Tests, GPS gesamt 29), `loadZillertalArenaPistes` mit gemeinsamem Abruf, Anzeige der Pisten je Abfahrt in `TrackDetailPage`. Auf dem Gerät mit synthetischer Fahrt entlang echter Pistenlinien geprüft. Auf dem Handy liegen zwei **synthetische Demo-Aufzeichnungen** (Gerlos-Gondeln, Zell-Pisten); in der App löschbar. Nicht committet.

## Eintrag 2026-11-18 (8) – Claude Code: Höhenprofil, Liftzuordnung, Route auf der Skikarte

Auf Nutzerwunsch: GPS-Track über die Skikarte legen, Lifte (und Pisten) zuordnen, Höhenprofil mit
Liften/Pisten. Umgesetzt: Höhenprofil, Route auf der Karte, **Lift**zuordnung. **Pisten offen**
(Datenlizenz, siehe [phase-9-gps.md](phase-9-gps.md#erweiterte-auswertung-höhenprofil-liftzuordnung-route-auf-der-skikarte)).

- `packages/gps/src/match.ts` (+ Test, 24 GPS-Tests gesamt), `components/track/ElevationChart.tsx`
  (+ Test), `data/resort/lift-labels.ts`, `LiftMiniMap.tsx` um `track`/`compact` erweitert,
  `TrackDetailPage.tsx` neu aufgebaut (Diagramm, Karte, verknüpfte Abschnittsliste),
  `TrackMap.tsx` entfernt. App 68 Tests grün.
- Auf dem Gerät liegt eine **synthetische Demo-Aufzeichnung** (Gondeln Dorfbahn Gerlos I/II) in der
  Debug-App, eingespielt per `adb push` + `run-as` (nur Debug-Builds); in der App unter Skitage löschbar.
  Hinweis für Git-Bash: `MSYS_NO_PATHCONV=1` setzen, sonst werden `/data/...`-Pfade umgeschrieben.
- Nicht committet.

## Eintrag 2026-11-18 (7) – Claude Code: Worker veröffentlicht, CPU-Umbau

Worker veröffentlicht (Versionen `9e43d2ec`, danach `c2d40062`). Live-Test am Samsung mit echter
Anmeldung: Upload funktioniert. Befund: erster Upload (19 Punkte) kostete **8 ms CPU** bei 10 ms Limit
im Free-Plan → Migration `0005_gps_tracks_text.sql` (Tabelle ersetzt, 1 Test-Zeile verloren), Server
speichert den komprimierten Track als undurchsichtigen Base64-Text und entpackt nicht mehr
(`apps/api/src/gps-tracks.ts`; `GET …/data` liefert JSON). API-Tests angepasst (39 grün). Danach
gemessen: Upload 2 ms warm / 6 ms kalt. Details in [phase-9-gps.md](phase-9-gps.md).
Offen: Test mit einem echten, langen Skitag (CPU und Auswertung), Akku-Abnahme, Gruppenfreigabe.
Hinweis: Das Handy hat einen PIN-Sperrbildschirm; Geräteskripte brauchen ein entsperrtes Display
(`adb shell wm dismiss-keyguard` genügt nicht). Nicht committet: Migration 0005, gps-tracks.ts,
Tests, Doku.

## Eintrag 2026-11-18 (6) – Claude Code: Migrationen 0003/0004 produktiv

Phase 4 wurde vom Nutzer committet. Migrationen 0003 und 0004 per
`wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc` angewendet
(vorher `migrations list`: genau diese beiden ausstehend; Time-Travel-Bookmark
`00000010-00000000-00005127-80a92f26d4fd37aa37f5f9795a15566e` notiert). Danach geprüft: alle Tabellen
vorhanden, 1 Nutzer / 1 Sitzung unverändert, `gps_tracks` und `skiing_days` leer.
**Der Worker ist noch nicht veröffentlicht** (neue Endpunkte `/skiline/import`, `/skiing-days`,
`/gps-tracks` sind produktiv noch 404). Nächster Schritt nach Freigabe:
`pnpm --filter @skiurlaub/api exec wrangler deploy --config wrangler.production.jsonc`, dann Upload
am Gerät testen und Worker-CPU messen.

## Eintrag 2026-11-18 (5) – Claude Code: Phase 5 gestrichen, GPS-Tracking

Entscheidungen des Nutzers: Phase 5 (Skipässe/NFC) **gestrichen**, da keine Skiline-Freigabe zu
erwarten ist; GPS-Tracking (Phase 9) vorgezogen; Upload gleich dabei; Akkubudget 15–20 Punkte/8 h.
Details, Grenzen, Deploy: [phase-9-gps.md](phase-9-gps.md). **Nicht committet, nicht veröffentlicht.**

- Neues Paket `packages/gps` (Bereinigung, Höhe, Segmentierung, Statistik, Codec); 19 Tests.
- Android: `GpsTrackingService`, `TrackStore`, `SkiurlaubGpsPlugin`; Manifest-Berechtigungen und
  Service; `play-services-location:21.3.0`; API-Plugin-Positivliste um `/gps-tracks` erweitert.
- App: `SkitagePage`, `TrackDetailPage`, `TrackMap`, `data/gps-client.ts`; Routen `/skitage`,
  `/skitage/:trackId`.
- API: Migration `0004_gps_tracks.sql`, `src/gps-tracks.ts`, Routen `/gps-tracks`; DTOs in shared;
  8 neue Tests (API gesamt 39). Root-`pnpm test` führt skiline, gps, mobile und api aus.
- Am Samsung geprüft: Berechtigungen, Aufnahme, Pause/Stopp, gesperrtes Display, Detail, Karte.
  **Nicht geprüft:** Upload am Gerät (Server noch ohne Migration), echter Skitag, Akku, Worker-CPU im
  Free-Plan.
- Datenschutz: Das Testgerät hat eine Test-Aufzeichnung mit echtem Standort (in der App löschbar);
  Screenshots mit Kartenausschnitt wurden aus `artifacts/` gelöscht.
- Offene Punkte: Deploy (Migrationen 0003 + 0004), Akku-Messplan durchführen, Hinweis auf
  „Schlafende Apps“, Pistenerkennung (Datenlizenz), Gruppenfreigabe (Phase 7), Offline-Queue (Phase 8).

## Eintrag 2026-11-18 (4) – Claude Code: Phase 4 (Skiline-Adapter)

Phase 3 wurde vom Nutzer freigegeben und committet (`92d0355 Phase 3`). Phase 4 begonnen
und umgesetzt, **noch nicht committet und nicht veröffentlicht**. Details, Annahmen und
Grenzen: [phase-4-skiline.md](phase-4-skiline.md).

- Neues Paket `packages/skiline` (`@skiurlaub/skiline`): IDs, Tickets, Zod-Schemas inkl.
  verschachteltem `SkiingDay.data`, Normalisierung, Mock, Sync-Regeln, gesperrter
  Live-Adapter (kein HTTP-Code). 72 Tests.
- API: Migration `0003_skiing_days.sql`, `apps/api/src/skiing-days.ts`, Routen
  `POST /skiline/import`, `GET /skiing-days`, `DELETE /skiing-days/:id`; DTOs in
  `packages/shared`. 10 neue Tests in `apps/api/test/skiing-days.test.ts` (31 API-Tests
  gesamt). Root-`pnpm test` führt das neue Paket mit aus.
- Keine Oberfläche, kein Skiline-Netzwerkzugriff, keine Produktions-Migration.
- Offen: Freigabe/echter anonymisierter Export, Token-Vault, Feldnamen/Einheiten
  (Liste in phase-4-skiline.md), Veröffentlichung (Migration + Deploy).
- Hinweis: Mehrzeilige Bash-Heredocs mit Sonderzeichen wurden in dieser Umgebung
  mehrfach abgeschnitten; Dateien daher mit dem Write-Werkzeug schreiben und
  danach prüfen.

## Eintrag 2026-11-18 (3) – Claude Code: zurück zu Phase 3, Sitzungsdauer

Entscheidungen des Nutzers: (1) Konto-Löschung/Export erst in Phase 11, (2)
Sitzungen 30 Tage mit Verlängerung.

- `apps/api/src/sessions.ts`: `sessionLifetime` 30 Tage, `maxSessionAge` 90 Tage,
  `requireSession` verlängert höchstens einmal pro Tag (UPDATE nur wenn Gewinn
  ≥ 24 h) und nie über `created_at + 90 Tage`; abgelaufene Sitzungen werden nicht
  wiederbelebt. `/me` liefert das aktuelle `sessionExpiresAt`.
- `SkiurlaubApiPlugin.java`: nach `GET /me` (200) wird das lokale Ablaufdatum im
  Keystore-Speicher auf `sessionExpiresAt` nachgezogen. Ohne das hätte die App das
  Token nach 30 Tagen lokal verworfen, obwohl der Server es verlängert hat.
- Test `verlängert Sitzungen höchstens täglich und nie über 90 Tage…` (API: 21/21
  grün). Typecheck, Lint, Format grün. APK installiert; `/me` auf dem Gerät mit
  der echten Sitzung: 200, kein Token in der Antwort.
- **Veröffentlicht am 18.11.2026** (Worker-Version a386fb99-c4d6-4125-bc60-752ab626e8ae). Vorher lief der Produktions-Worker mit 7 Tagen
  (`sessionExpiresAt` am Gerät: 24.11.2026). Deploy:
  `pnpm --filter @skiurlaub/api exec wrangler deploy --config wrangler.production.jsonc`.
- Manuelle Prüfungen am Handy abgeschlossen (Nutzer): Google-Dialog abbrechen,
  Logout, erneute Anmeldung. Danach am Gerät bestätigt: `sessionExpiresAt` =
  Anmeldezeit + 30 Tage (17.12.2026 23:33 UTC), `/me` 200, kein Token in der Antwort.
- **Phase 3 ist bereit für die Freigabe durch den Nutzer.** Phase 4 (Skiline-Adapter)
  nicht begonnen.
  Erledigt: nicht erlaubtes Konto (Nutzer bestätigte am 18.11.2026 die Meldung
  „Dieses Konto ist für die App nicht freigegeben“).

## Eintrag 2026-11-18 (2) – Claude Code: animierter Wetter-Hintergrund

- Neu: `components/dashboard/WeatherScene.tsx` + `weather-scene.css`. Illustrierte
  SVG-Szene hinter dem Hero (eigene Grafik, keine Lizenzfragen, keine Bilddateien).
  7 Motive (`sceneKind(code)`: clear, partly, overcast, fog, rain, snow, storm,
  WMO-Codes wie `weather-code.ts`) × Tag/Nacht (`weather.isDay`), je eigene
  Farbpalette per CSS-Variablen (`.weather-scene[data-kind][data-day]`).
- Animiert (nur `transform`/`opacity`): ziehende Wolken, Sonnen-/Mondglühen,
  funkelnde Sterne (nur klare/teilw. bewölkte Nacht), Regen, Schnee, Nebelbänke,
  Blitz-Flackern bei Gewitter. Positionen sind deterministisch (seeded RNG, kein
  `Math.random`). Bei `prefers-reduced-motion` stehen alle Animationen still
  (Wolken behalten ihre Position über `--x`).
- Hero (`.hero[data-scene]` in `styles/app.css`): weiße Schrift mit Text-Schatten
  plus Abdunkelungs-Verlauf (`.weather-scene::after`) für Lesbarkeit; Badge dunkel.
  Ohne Wetterdaten (Laden/Fehler) bleibt der frühere blaue Verlauf ohne Szene.
- Tests: `WeatherScene.test.tsx` (Code→Motiv, Tag/Nacht-Elemente). Insgesamt 65
  Unit- und 18 E2E-Tests grün. Alle 14 Motive wurden per temporärer Playwright-Spec
  mit gemocktem Wetter (`weather_code`, `is_day` in `weatherResponse()`) als
  Screenshot geprüft; die Spec wurde wieder gelöscht.
- Nicht geprüft: Akkuverbrauch/Ruckeln bei laufender Animation über längere Zeit,
  Verhalten bei Systemschrift "groß" (Hero hat `min-height: 236px`), TalkBack
  (Szene ist `aria-hidden`).
- Optional später: echte Fotos als Alternative (Lizenz/Namensnennung klären),
  Szene bei App-Hintergrund pausieren.

## Eintrag 2026-11-18 – Claude Code: Livecam-Popups

- Popup als Karte: 16:9-Vorschaubild, Titel, Quelle (`webcam.credit`), vollbreiter
  Button "Livecam öffnen ↗", runder Schließen-Button auf dem Bild (36 px).
  Markup in `LiftMiniMap.tsx` (Klassen `webcam-popup__media/__body/__action`),
  Styles am Ende des Webcam-Blocks in `styles/app.css`.
- Zwei Ursachen behoben, die das Popup abschnitten/unlesbar machten:
  1. `maxBounds` war zu eng (`pad(0.35)`): auf hohen Hochformat-Displays zeigt die
     Karte weit mehr als die Bounds-Höhe, dadurch konnte Leaflets Auto-Pan nicht
     verschieben und das Popup ragte über die Karte. Jetzt `pad(4)`,
     Auto-Pan-Abstände `(16,16)` oben/links und `(16,72)` unten/rechts (die Chips
     liegen außerhalb der Karte, die alten 96 px entfallen).
  2. Leaflet-CSS überschrieb Link-/Close-Button-Farben (`.leaflet-container a`);
     deshalb höhere Spezifität (`.lift-leaflet-map .webcam-map-popup a…`) und
     `color: var(--on-primary) !important` am Button.
- Tooltip wird beim Öffnen des Popups geschlossen (`popupopen`-Handler).
- Geprüft: Typecheck, Lint, 18 E2E-Tests; Screenshots hell/dunkel mit offenem
  Popup (Fichtensee) auf dem Samsung. Nicht geprüft: andere Webcams, Randlagen
  (Popup am rechten/unteren Kartenrand), Bild-Ladefehler (Alt-Text im Platzhalter).
- Offen/Beobachtung: Quelle wird roh angezeigt ("official", kleingeschrieben).

## Eintrag 2026-11-17 (nachts, 2) – Claude Code: Kartenbildschirm

Befund am Gerät: Legende belegte zwei Zeilen, "Schwer" (dunkelblau) war im
Dunkelmodus unlesbar, Chips liefen aus dem Bild, Dunkelmodus-Kacheln wirkten
grau-grün, Zoom-Buttons weiß/schwarz.

- `LiftMiniMap.tsx`: Legende jetzt `<details className="map-legend">` als
  einklappbares Overlay unten links auf der Karte; Chips verkürzt auf
  "Arena Tour", "Lifte", "Pisten", "Livecams" (Zustand über `aria-pressed` und
  Farbe); äußerer Wrapper `map-view`; Webcam-Marker 32 px.
- `styles/app.css`: Kartenhöhe füllt den Viewport zwischen App-Leiste, Chip-Zeile
  und Navigation (`calc(100dvh - …)`, min. 320 px); Dunkelmodus-Kacheln per
  `invert(1) hue-rotate(180deg)`-Filter (nur Tile-Pane, Linien/Marker unberührt);
  abgerundete Zoom-Buttons, Attribution im Theme, Legenden-Swatches mit Rand.
- Es gibt keine Tests, die an den alten Button-Texten hängen (geprüft per grep).
- Geprüft: Typecheck, Lint, 48 Unit-, 18 E2E-Tests; Screenshots hell/dunkel und
  Legende offen auf dem Samsung. Nicht geprüft: Livecam-Popup, Arena-Tour-Modus,
  Karte bei geöffneten Liften (aktuell alles geschlossen), große Systemschrift.
- Bekannt: Die Startansicht zeigt die gesamte Arena (breit); auf einem hohen
  Hochformat-Bildschirm bleibt oben/unten viel leere Karte.

## Eintrag 2026-11-17 (nachts) – Claude Code: Hellmodus + übrige Tabs

- Hellmodus der Startseite am Gerät geprüft: unauffällig, Bernstein-Chip lesbar.
- `EmptyPage.tsx`: neue Prop `icon`; zentrierte Karte mit getöntem Icon,
  Überschrift "Noch keine <Titel>" (vermeidet doppelten Titel mit der App-Leiste,
  E2E nutzt exakte Heading-Namen), Chip "Noch nicht verfügbar", tonaler Button.
  404 bleibt "Diese Seite gibt es nicht".
- `ProfilePage.tsx`: Profilkopf mit Avatar (Initiale, Bernstein) statt `<dl>`.
  Die E-Mail erscheint genau einmal (E2E nutzt `getByText(email, { exact: true })`).
  `h2` "Dein Profil", der Linktext "Skipässe Verwaltung" und das Label
  "Darstellung" sind unverändert, weil die Android-Smoke-Skripte daran hängen.
- CSS: kompaktere Einstellungsgruppe, Eingabefelder mit 14 px Radius, deaktivierter
  Primärbutton als tonale Fläche statt 50 % Transparenz.
- Geprüft: Typecheck, Lint, 48 Unit-, 18 E2E-Tests; Screenshots hell/dunkel für alle
  vier Tabs auf dem Samsung. Das Screenshot-Skript (CDP über adb) lag nur im Scratchpad und ist nicht im Repo.
- Weiterhin offen: große Systemschrift/TalkBack, Kopfzeilen-Icon (Regler) benennen,
  Karten-Screen visuell prüfen, Wettersymbole/Animationen/Prognosekurve.

## Eintrag 2026-11-17 (spät) – Claude Code: "edler/moderner" (Hero, Kacheln, Akzent)

Nur UI, dunkel auf dem Samsung geprüft (Hellmodus noch nicht angesehen).

- Hero statt Wetterkarte: Verlauf aus `--primary-container`, Temperatur 64 px
  (Gewicht 200), Kleinbuchstaben-Label "AM BERG · 1.694 M", Countdown-Chip in
  Bernstein (`CountdownChip` in `DashboardPreview.tsx`, tickt isoliert). Der
  Countdown wurde aus `TripHeader.tsx` entfernt (dort nur noch Ziel + Datum).
- Skigebiet als drei Kennzahl-Kacheln (Lifte, Pisten, Schnee) mit Fortschrittsbalken
  (Lifte/Pisten); darunter Liste mit Pistenkarte und offiziellem Schneebericht.
  `SnowCard.tsx` exportiert jetzt `SnowTile` und `SnowReportLink`.
- Neue Tokens in `styles/app.css`: `--accent`, `--accent-container`,
  `--on-accent-container` (hell/dunkel); halbtransparente 1-px-Ränder an Karten.
  Neuer CSS-Block "Hero, KPI tiles, amber accent" am Dateiende.
- E2E-Erwartungen angepasst ("1 / 2 offen", Überschrift "Offizieller
  Schneebericht"). Geprüft: Typecheck, Lint, 48 Unit-, 18 E2E-Tests grün.
- Offen: Designpunkte 4–7 (eigene Wettersymbole, Animationen, Prognose als
  Kurve, Typografie-Feinschliff) sowie 5–7 der früheren Liste.

## Eintrag 2026-11-17 (später) – Claude Code: Startseiten-Design

Auf Nutzerwunsch Designpunkte 1–4 umgesetzt (nur UI, keine Datenlogik):

- Wetterkarte kompakt (zwei Zeilen), Titel "Am Berg" und Badge "Aktuell" entfallen;
  Badges erscheinen nur noch bei Problemen (Veraltet/Lädt/Nicht verfügbar).
- Leerzustand: Ist `lifts.open === 0` bei `total > 0` und Daten nicht veraltet,
  werden Zahlen gedämpft und ein Hinweis "Derzeit ist kein Lift in Betrieb –
  außerhalb der Betriebszeiten oder vor Saisonstart" gezeigt (bewusst ohne
  erfundene Saisondaten).
- Eine gemeinsame Zeile "Aktualisiert HH:MM" (älteste der beiden Quellen); bei
  veralteten Daten "Veraltet · Stand <Datum Uhrzeit>" in Warnfarbe.
- Schnee ist jetzt eine Listenzeile (`SnowRow` in `SnowCard.tsx`) innerhalb der
  Skigebiet-Liste, verlinkt den offiziellen Schneebericht; Modellwert bleibt
  gekennzeichnet.
- Geändert: `DashboardPreview.tsx`, `SnowCard.tsx`, `styles/app.css`,
  `e2e/navigation.spec.ts` (Erwartungstexte angepasst).
- Geprüft: Typecheck, Lint, 48 Unit-Tests, 18 E2E-Tests grün; APK auf Samsung
  installiert und per Screenshot kontrolliert.
- Offen aus der Designliste: Punkte 5–7 (Leerzustände der anderen Tabs,
  Kontrast/große Schrift/TalkBack, Kopfzeilen-Icon). Hellmodus, Karte, Profil und
  Skitage wurden noch nicht visuell geprüft.
- Build-Hinweis: `pnpm android:install` scheitert aus Git-Bash (`gradlew.bat`
  nicht gefunden). Workaround: im Ordner `apps/mobile/android` mit
  `JAVA_HOME` (Android-Studio-JBR) `cmd.exe //c ".\gradlew.bat --no-daemon assembleDebug"`,
  dann `adb install -r app/build/outputs/apk/debug/app-debug.apk`. In PowerShell
  funktioniert das Skript.

## Eintrag 2026-11-17 – Claude Code: Phase-3-Verifikation

### Ausgangslage

Codex war bei Phase 3 (Backend + App-Authentifizierung) und hatte zuletzt den
echten Google-Login auf dem Samsung (R3CW609DQVF) bestätigt. Es lief noch ein
Smoke-Test zur Sitzung nach App-Neustart; die Doku war dazu schon ergänzt.

### Durchgeführt (nur Verifikation, keine neuen Features)

- `pnpm typecheck`: erfolgreich (shared, api, mobile).
- `pnpm test`: API 20/20 (Worker + D1 + Google-Nachweise), Mobile 48/48.
- `pnpm format:check`: erfolgreich.
- `pnpm lint`: war **fehlgeschlagen** (236 Fehler). Ursache: das Build-Artefakt
  `apps/api/dist-production/` (vom Wrangler-Dry-Run) wurde mitgelintet.
  Fix: `**/dist-production/**` in [eslint.config.js](../eslint.config.js) und
  `.prettierignore` ignoriert. Danach Lint grün.
- Live-Backend `https://skiurlaub-api.kroniq-caps.workers.dev` (nur lesend):
  `/health` ok; `/auth/status` mit Android-Header: `google: true`,
  `appEmailCode: false`, `localTestMode: false`, `skiline: unavailable`;
  `/me` ohne Anmeldung: 401.
- `apps/api/wrangler.production.jsonc` (enthält Cloudflare-Account-ID, D1-ID,
  Google-Web-Client-ID) war nicht ignoriert; das Repo ist öffentlich. Jetzt in
  `.gitignore`. Die Datei bleibt lokal; Vorlage ist
  `apps/api/wrangler.production.example.jsonc`. Keine Geheimnisse (Secrets
  liegen als Wrangler-Secrets in Cloudflare, `.env.production.local` ist
  ignoriert).
- Nicht erneut ausgeführt: Android-Gerätetests (`pnpm android:smoke`,
  `android:auth-smoke`); sie brauchen das angeschlossene Handy.

### Aktueller Stand Phase 3

Technisch umgesetzt und geprüft: Cloudflare Worker (`apps/api`), D1 mit
Migrationen `0001_identity.sql`, `0002_google_login.sql`, eigene Nutzer und
Sitzungen (Keystore-geschützt auf Android, Token nie in React/Bridge),
Google-Login (Credential Manager, serverseitige Nonce + JOSE-Prüfung),
E-Mail-Code-Login nur als lokaler Testmodus (`@example.invalid`), Logout,
CSRF-/Header-Schutz, Skiline bewusst deaktiviert.

Deployment: Worker `skiurlaub-api` (workers.dev), D1 `skiurlaub-db` (EU),
Secrets `AUTH_HMAC_SECRET`, `ALLOWED_EMAILS` gesetzt. Erlaubtes Konto:
th.claudi@gmail.com. Android-Debug-Client (Paket `cc.quxx.skiurlaub.debug`)
bei Google angelegt.

### Offene Punkte vor formalem Phase-3-Abschluss (Review durch Nutzer)

1. Manuell am echten Backend prüfen: Abbruch im Google-Dialog, nicht erlaubtes
   Google-Konto, Logout + erneute Kontowahl.
2. Aufbewahrungs-/Löschregeln und Betriebsfreigabe für echte personenbezogene
   Daten festlegen (siehe [security.md](security.md)).
3. Release-Signierung braucht später einen eigenen Android-Client bei Google
   (anderer SHA-1) – Phase 10, siehe [google-login-setup.md](google-login-setup.md).
4. Skiline-SSO: weiterhin unbestätigt (JAMES-Doku, keine Freigabe) – Phase 4.
5. Gruppenautorisierung ist noch nicht gebaut (Phase 7); Tabellen für Gruppen
   existieren bereits in 0001.

### Nächster Schritt

Nutzer gibt Phase 3 frei (oder nennt Korrekturen). Erst danach Phase 4
(Skiline-Adapter: Mock, Zod-Parser, Import, Ticketmodell) – nichts davon
wurde vorgezogen.

### Praktische Hinweise für den Wechsel

- Befehle: `pnpm dev` (Web+API), `pnpm android:install`, `pnpm android:smoke`,
  `pnpm android:auth-smoke` (Letzteres mit lokalem Testserver, siehe
  [phase-3-auth-decision.md](phase-3-auth-decision.md)).
- Die Web-App wurde zugunsten der Android-App eingefroren; die aktive App liegt
  unter `apps/mobile` (React + Capacitor). Design: [android-design-review.md](android-design-review.md).
- Agent-Skills liegen in `.agents/skills/` (ponytail, mobile-android-design,
  make-interfaces-feel-better).
- Nichts wurde committet; die gesamte Migration liegt unversioniert im
  Arbeitsverzeichnis (Git zeigt viele gelöschte Alt-Dateien). Vor einem Commit
  prüfen, dass `.env*`, `artifacts/` und `wrangler.production.jsonc` ignoriert bleiben.
