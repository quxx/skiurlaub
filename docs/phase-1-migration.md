# Phase 1 – React-Grundgerüst und Migration

Stand: 17.11.2026. Neue Phasenfolge aus dem Master-Prompt; die alten
`phase-1-konzept.md` bis `phase-5-wetterdaten.md` bleiben als Historie bestehen.

## Änderungen

- Bestehende React-App inklusive aller Assets nach `apps/web` verschoben.
  pnpm-Workspace, festgelegte Paketmanager-Version, gemeinsames Root-Tooling und
  Lockfile. Keine leeren Backend-/Fachpakete angelegt.
- React Router mit Home, Skitage, Gruppe, Skipässe, Profil und 404-Ansicht.
  Bottom-Navigation mobil, Sidebar auf Desktop, Fokus nach Navigation und Skiplink.
- Nordic-Clean-Oberfläche mit Salbeifarben, hellen und dunklen Flächen, persistentem
  Light/Dark/System-Theme, Systemwechsel, Safe Areas und Touch-Zielen.
- Countdown und Reisephasen, Wetter, Modellschnee, 7-Tage-/Stundenprognose,
  Resortstatus, Leaflet-Karte, Webcams und Arena-Tour erhalten.
- Home und Kartenmodul werden separat geladen. Gebietszuordnung aus
  `LiftMiniMap.tsx` nach `data/resort/status-matching.ts` extrahiert;
  widersprüchliche Lift-/Pistenmeldungen werden neutral dargestellt.
- Reisekonfiguration mit Zod validiert, Ende weiterhin optional. Falsche Zeiträume,
  Zeitzonen und Koordinaten werden abgewiesen. Jahresanzeige im Hero aus Reisedatum.
- TanStack-Query-Provider als Grundlage eingerichtet. Bestehende Wetter-/Resort-
  Kontexte und Caches bleiben für die funktionserhaltende Migration erhalten;
  deren weitergehender Umbau gehört zu Phase 2.
- ESLint, Prettier, Vitest/Testing Library, Playwright und GitHub-Actions-Workflow.
  Kein Zustand oder Recharts ohne aktuellen fachlichen Bedarf.

## Technische Entscheidungen

Offizielle Dokumentation vor Verwendung geprüft:
[React Router](https://reactrouter.com/start/declarative/installation),
[Vitest](https://vitest.dev/guide/),
[ESLint](https://eslint.org/docs/latest/use/configure/configuration-files),
[Playwright](https://playwright.dev/docs/test-configuration),
[pnpm](https://pnpm.io/workspaces).
TypeScript ist auf die 6.0-Reihe festgelegt, da die geprüfte
typescript-eslint-Version TypeScript 7 noch nicht unterstützt. ESLint wurde auf
die unterstützte 10er-Reihe aktualisiert. Konkrete Auflösungen im pnpm-Lockfile.
Keine neue produktive Datenquelle und keine externe Infrastruktur aktiviert.

`.env.example` bleibt im Root; `apps/web/vite.config.ts` nutzt `envDir: '../..'`.
Öffentliche Umgebungsvariablen sind keine Secrets. Buildausgabe ist jetzt
`apps/web/dist`; Hosting-/CI-Pfade müssen darauf zeigen. SPA-Fallback für direkte
URLs ist erforderlich. Kein Deployment wurde ausgeführt.

## Tests und Abnahme

Unit-/Komponententests decken Countdown und Sommerzeit, Reisegrenzen, Konfiguration,
Theme/Systemwechsel/Persistenz/blockierten Speicher, Provider-Normalisierung,
frischen/veralteten Cache, Netzwerkfehler, fehlerhafte Antworten, Karten-Aliasnamen,
mehrdeutige Statusmeldungen und das Öffnen/Schließen der Stundenprognose ab.
Browsertests für Desktop und Pixel-7-Viewport prüfen alle vier zusätzlichen Routen
mit Reload, Navigation, persistentes Theme, Quellenfehler und Prognose/Karte.
Alle Daten in diesen Tests sind synthetisch; externe Netzwerkquellen werden gesperrt
oder gemockt. Screenshots liegen lokal unter `apps/web/test-results` (nicht versioniert).

Prüfstand: Frozen-Lockfile-Install, ESLint 10 ohne Warnungen,
Typecheck und Produktionsbuild erfolgreich. 15 Unit-/Komponententests in sechs
Dateien erfolgreich. Acht Desktop-/Mobil-Browsertests erfolgreich (33,5 Sekunden,
Exitcode 0). Prettier-Formatprüfung und `git diff --check` erfolgreich.
Build: Hauptbundle 292,55 kB (92,86 kB gzip), separates Home-Bundle 127,55 kB
und lazy Kartenbundle 176,52 kB. Das bestehende Hero-Bild bleibt 2.475,69 kB.
Der erste Browserlauf hatte acht erfolgreiche Fälle, hing jedoch beim
Serverabbau unter Windows in der Sandbox. Der erfolgreiche Abschlusslauf nutzte
einen direkt gestarteten Vite-Prozess außerhalb der Sandbox.

## Einschränkungen und nächste Phase

Skitage, Gruppe, Skipässe und Profil sind ehrliche leere Ansichten. Anmeldung,
Backend, Skiline, NFC, GPS, Ranking und echte Offline-Synchronisierung folgen in
ihren freigegebenen Phasen. Es gibt keine fingierten persönlichen Daten.
Reiseende ist weiterhin unbekannt. Hero-Bild bleibt circa 2,48 MB; zusätzliche
Bildoptimierung und vollständige Provider-/Cache-Schemavalidierung stehen aus.
Kartenkacheln und Geometrien benötigen Netz und haben keine Offlinegarantie.
Livequellen, echte Android-Geräte und Cloudflare-Deployment wurden nicht getestet.
Browsertests nutzen Chromium; Safari/Firefox und reale Sonneneinstrahlung sind
noch nicht geprüft. Die CI-Datei ist lokal vorbereitet, aber noch nicht auf GitHub gelaufen.

Phase 2: Dashboard und Datenprovider härten, Quellenfreigaben und Schneeprovider
prüfen, Aktualität und Zeitzonenverhalten weiter absichern. Review nach Phase 1.
