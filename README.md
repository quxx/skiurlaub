# SkiTrip 2027 – Hochkrimml

Android-App für den gemeinsamen Skiurlaub in Hochkrimml: Countdown, Wetter,
Lift- und Pistenstatus sowie persönliche Bereiche in Vorbereitung.

## Aktuelles Ziel: Android

Die App wird mit React und Capacitor 8 entwickelt. Die frühere Website wird
nicht weiter als Produkt verfolgt. Der React-Code liegt in `apps/mobile`,
das native Android-Projekt in `apps/mobile/android`. Die Oberfläche verwendet
eine untere Navigation auf Handys und eine Navigationsleiste auf Tablets.
Vite dient der Entwicklung und erzeugt die lokal in der APK enthaltenen Assets.

```powershell
pnpm android:build
pnpm android:install
```

Voraussetzungen: Android-SDK 36, JDK 21 und für die Installation ein per
USB-Debugging freigegebenes Android-Gerät. Unter Windows verwendet das Skript
die JBR von Android Studio; alternativ `SKIURLAUB_JAVA_HOME` setzen.
Die Debug-APK liegt in `artifacts/skiurlaub-debug.apk` und verwendet die
App-ID `cc.quxx.skiurlaub.debug`.

Persönliche Anmeldung ist im Android-Build noch nicht aktiviert: Ein
Produktionsbackend und produktiver E-Mail-Versand stehen aus. Die native
Keystore-Sitzungsanbindung ist lokal auf dem Handy getestet. Skiline ist
weiterhin nicht als bestätigter Identitätsanbieter verfügbar. Lokale
Testanmeldung wird auf dem Handy nicht angeboten.

Details: [Android-Umstellung](docs/android-migration.md).
Der aktuelle Entwurf wurde vollständig nach den Android-Designrichtlinien
neu aufgebaut: [Designentscheidungen und Prüfungen](docs/android-design-review.md).

## Neue Produktplanung – Phase 0

Die nachfolgenden alten Phasen 1–5 gehören zur bisherigen Dashboard-Entwicklung
und entsprechen **nicht** den Phasen des neuen Master-Prompts.
Phase 0 wurde freigegeben. Phase 1 ergänzt Workspace, Routing, Nordic-Clean-UI,
Themes und Qualitätssicherung: [Änderungen und Abnahme](docs/phase-1-migration.md).
Phase 2 ergänzt das abgesicherte Urlaubs-Dashboard mit vollständiger
Provider-/Cachevalidierung, Quellenzeiten, Modellschnee und Aktualisierung:
[Änderungen, Quellen und Abnahme](docs/phase-2-dashboard.md).

- [Übergabe / Arbeitsprotokoll (Codex ⇄ Claude Code)](docs/handover.md)
- [Phase 4: Skiline-Adapter, Mock und Import](docs/phase-4-skiline.md)
- [GPS-Tracking (vorgezogene Phase 9)](docs/phase-9-gps.md) und [Akku-Messplan](docs/gps-battery-test.md)
- [Ist-Zustand und Feature-Inventur](docs/features.md)
- [Zielarchitektur und Datenmodell](docs/architecture.md)
- [Migration, Risiken und konkreter Phase-1-Plan](docs/implementation-plan.md)
- [Skiline](docs/skiline-integration.md), [Sicherheit](docs/security.md),
  [GPS](docs/gps-tracking.md), [Deployment](docs/deployment.md),
  [Android-Releases](docs/android-release.md)

Prüfstand: 17.11.2026. Alle neuen Architekturentscheidungen sind Vorschläge
und benötigen vor ihrer Umsetzung die Freigabe für die jeweilige Phase.

Historische Dashboard-Phasen 1 bis 5:

- [Architektur und Datenquellen](docs/phase-1-konzept.md)
- [Designsystem und Responsive-Konzept](docs/phase-2-design.md)
- [Interaktive Designvorschau](design-preview/index.html)
- [Projektsetup und Komponentenarchitektur](docs/phase-3-setup.md)
- [Frontend-Logik und automatische Reisephasen](docs/phase-4-frontend.md)
- [Open-Meteo-Wetterintegration](docs/phase-5-wetterdaten.md)
- [Lift- und Pistenstatus über status.live](docs/status-live-resortdaten.md)

## Lokale Entwicklung

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Weitere Prüfungen:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @skiurlaub/mobile exec playwright install chromium
pnpm test:e2e
```

Node 24 oder neuer, pnpm 10.32.1 (im packageManager-Feld festgelegt).
Falls Corepack nicht installiert ist: `npm install --global pnpm@10.32.1`.
Die App liegt in `apps/mobile`; `.env.example` bleibt im Repository-Root.
Vite liest die Konfiguration dort über `envDir`. Ausgabe: `apps/mobile/dist`.
Die folgenden Planungsdokumente beschreiben teilweise den früheren Web-Stand;
für die Plattformentscheidung gilt die Android-Umstellung.

Stack: React, TypeScript strict, Vite, Tailwind CSS, Lucide, Leaflet,
React Router, TanStack Query und Zod. Noch nicht verfügbare persönliche
Bereiche zeigen leere Ansichten; sie erzeugen keine Konten oder Aktivitäten.

Wetter, modellierte Schneedecke am Standort, auswählbare 7-Tage-Prognose und
stündliche Detailansicht werden direkt von Open-Meteo geladen. Die Schneedecke
ist klar als Modellwert und nicht als offizielle Berg- oder Talschneehöhe des
Skigebiets gekennzeichnet. Wenn die Quelle nicht erreichbar ist, zeigt die
Oberfläche einen Lade- oder Fehlerzustand an und verwendet keine Ersatzdaten.

Lift- und Pistenmeldungen für die gesamte Zillertal Arena kommen zusätzlich
über `status.live`. Sie sind als nichtoffizieller Drittanbieterstatus mit
Quelle und Aktualisierungszeit gekennzeichnet. Die geografische Liftkarte nutzt
OpenSkiData/OpenSkiMap-Geometrien aus OpenStreetMap (ODbL) und verknüpft sie mit
den Einzelmeldungen von `status.live`. Eine interaktive Leaflet-Karte lädt dafür
nur die im sichtbaren Ausschnitt benötigten OpenStreetMap-Kacheln. Zusätzlich
werden die kartierten Abfahrtspisten aus den OpenSkiData-Gebietskacheln von
LiftRadar nach Schwierigkeit eingezeichnet und über Pistennummer plus
Schwierigkeitsgrad mit den Einzelstatus von `status.live` verknüpft. Eine
eigene Arena-Tour-Ansicht filtert die Karte auf die Lifte und Pistennummern
des offiziellen Intermaps-Tour-Layers für die Runde Hochkrimml–Zell. Eine
offizielle Schneehöhe ist weiterhin nicht angebunden; der offizielle
Schneebericht bleibt verlinkt.
