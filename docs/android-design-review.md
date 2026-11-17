# Android-Design: vollständiger Neustart

Stand: 17.11.2026. Modus **full**. Geltungsbereich: Start, Wetterdetails,
Pistenkarte, Profil/Anmeldung, Platzhalter für Skitage/Gruppe/Skipässe sowie
gemeinsame Navigation. React + Capacitor 8; vorhandenes Tailwind/CSS-System.
Die frühere salbeigrüne Website-Gestaltung wurde verworfen. Kein Compose:
Android-Muster werden in der lokal eingebetteten React-Oberfläche umgesetzt.

## Grundlage

Verwendete Skills: `mobile-android-design` und `make-interfaces-feel-better`,
einschließlich ihrer Referenzen. Offizielle Quellen:

- [Android UI-Design](https://developer.android.com/design/ui?hl=de)
- [Mobile Android / Material 3](https://developer.android.com/design/ui/mobile?hl=de)
- [Themen, Farben und Typografie](https://developer.android.com/design/ui/mobile/guides/styles/themes?hl=de)
- [Layoutgrundlagen](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics?hl=de)
- [Android-Zurück](https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back?hl=de)

Die Richtlinien werden als Gestaltungsgrundlage verwendet. Vollständige
Material-Komponenten oder Predictive-Back-Vorschau werden nicht behauptet.

## Farbentscheidung

| Rolle                | Hell      | Dunkel    |
| -------------------- | --------- | --------- |
| Primary              | `#185FA5` | `#A2CAFF` |
| On primary           | `#FFFFFF` | `#00325B` |
| Primary container    | `#D4E4FF` | `#124878` |
| On primary container | `#00325C` | `#D4E4FF` |
| Background           | `#F8F9FC` | `#101418` |
| Surface              | `#EEF1F6` | `#1C2025` |
| Text                 | `#191C20` | `#E1E2E8` |

Blau bündelt Auswahl und Aktionen. Neutrale Flächen strukturieren Listen.
Grün und Amber tragen ausschließlich Statusbedeutung und werden durch Text
ergänzt. Das Theme folgt standardmäßig Hell/Dunkel des Systems; die Auswahl
befindet sich im Profil. Dynamische Wallpaper-Farben sind noch nicht angebunden.

## Abdeckung

| Kategorie   | Tatsächlich geprüft                                                            | Ergebnis                                                                                             |
| ----------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Typography  | App-Bar, Reisezeile, Messwerte, Quellen, Prognose, Profil; Gerät und Quelltext | Große Website-Typografie entfernt; Roboto/Systemschrift, tabellarische Werte                         |
| Surfaces    | Start, Listen, Kartenschalter, Profil, Hell/Dunkel auf Samsung                 | Tonale Flächen statt Glasflächen und dekorativer Schatten                                            |
| Animations  | CSS-Übergänge, Countdown und Prognose, Zurück-Handler                          | Sekündliche Ziffernanimation und Diagramm-Einblendungen entfernt; reduzierte Bewegung berücksichtigt |
| Icons       | Navigation, Listen, Wetter, Karte, Profil im Code und auf Gerät                | Einheitliches Lucide-System, currentColor, konsistente Strichstärke                                  |
| Performance | Produktionsbuild, Routen, Assets, CSS-Regeln                                   | Kein Fotobild mehr im Bundle; Leaflet separat und erst auf Kartenansicht                             |

## Befunde und umgesetzte Änderungen

Zeilen beziehen sich auf den jeweiligen Komponentenbeginn; CSS-Rollen sind in
`apps/mobile/src/styles/app.css:1` zentral definiert.

| Severity | Location                                                                                        | Before                                                                        | After                                                                                      | Why                                                |
| -------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| HIGH     | `apps/mobile/src/styles/index.css:1`, `apps/mobile/src/styles/app.css:1`                        | Übereinanderliegende Web-Themes, erzwungene Abdunkelung                       | Neue konsistente Farbrollen; Android Force Dark deaktiviert                                | Lesbarkeit, Themenkonsistenz                       |
| MEDIUM   | `apps/mobile/src/components/hero/TripHero.tsx:6`                                                | Fotokopf und große Sekundenkacheln                                            | Kompakte Reisezeile mit Ziel, Datum und verbleibenden Tagen                                | Informationen auf einen Blick; Motion restraint    |
| MEDIUM   | `apps/mobile/src/components/dashboard/DashboardPreview.tsx:19`                                  | Lange Folge großer Dashboard-Karten                                           | Ein Wettercontainer, gruppierte Lift-/Pistenzeilen und Kartenaktion                        | Android-Listenstruktur statt Website-Sektionen     |
| MEDIUM   | `apps/mobile/src/components/dashboard/SnowCard.tsx:6`                                           | Große Schneekarte mit mehrfachen Metadatenblöcken                             | Kompakte Modellschnee-Zeile mit klarer Modellkennzeichnung                                 | Präzise Hierarchie; keine Messung vortäuschen      |
| MEDIUM   | `apps/mobile/src/components/forecast/ForecastPreview.tsx:20`                                    | Hohe Tageskacheln, große Grafik und dekorative Webcam-Fotokarte               | Sieben kompakte Tageszeilen mit direkt zugeordneten Stundenwerten, Livecam-Aktionszeile    | Touchgerechte Informationsdichte und Kontext       |
| MEDIUM   | `apps/mobile/src/app/MapPage.tsx:1`                                                             | Große eingebettete Karte mitten im Dashboard                                  | Eigener Bildschirm mit App-Bar-Zurück und bedienbaren Karten-Chips                         | Klare Navigation, weniger Ladeaufwand auf Start    |
| MEDIUM   | `apps/mobile/src/components/layout/AppLayout.tsx:1`                                             | Website-Kopf, Theme-Dropdown, doppelte Titel                                  | 64px-App-Bar, ein Titel, Einstellungen im Profil; Navigation/Rail nach Fenstergröße        | Android-Komponenten- und Layoutmuster              |
| MEDIUM   | `apps/mobile/src/app/ProfilePage.tsx:120`, `apps/mobile/src/app/EmptyPage.tsx:1`                | Große leere Karten und technische Login-Erklärungen                           | Kompakte Einstellungszeile, klare Anmeldungs-Verfügbarkeit, einfache Leerzustände          | Produktverständlichkeit und Aktionsebenen          |
| MEDIUM   | `apps/mobile/src/styles/app.css:1`, `apps/mobile/src/app/NativeLifecycle.tsx:1`                 | Überlagerung durch native Titelleiste; Systemleisten konnten Inhalt verdecken | Kein nativer ActionBar-Container, CSS-Safe-Areas, native Zurück-Behandlung und Custom Tabs | Plattformintegration und sichere Berührungsflächen |
| LOW      | `apps/mobile/src/components/ui/StatusBadge.tsx:1`, `apps/mobile/src/components/ui/Button.tsx:1` | Viele Konturen/Farben und uneinheitliche Aktionsgestaltung                    | Semantische Statusfarben, tonale Aktionen, 48px-Ziele, zurückhaltender Druckzustand        | Zustände, Icons und Ebenen bleiben erkennbar       |

## Erwogen und verworfen

| Ort         | Kandidat                                                   | Grund                                                                                    |
| ----------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Start       | Größeres Bergfoto als Wiedererkennungsmerkmal              | Wiederholt den ausdrücklich verworfenen Website-Eindruck; verdrängt Nutzdaten            |
| Farben      | Salbeigrün beibehalten                                     | Vollständiger gewünschter Neustart; Gletscherblau passt zum neuen sachlichen App-Konzept |
| Countdown   | Animierte Sekunden oder ringförmiger Fortschritt           | Zu viel Aufmerksamkeit für einen langfristigen Reisetermin                               |
| Navigation  | Zusätzliche große Aktionskacheln für jede spätere Funktion | Dupliziert die untere Navigation und suggeriert noch fehlende Funktionen                 |
| Architektur | Compose-Oberfläche                                         | Benutzer hat ausdrücklich React + Capacitor gewählt                                      |

## Verifikation

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: erfolgreich.
- `pnpm --filter @skiurlaub/mobile test`: 34 Tests erfolgreich.
- `pnpm --filter @skiurlaub/api test`: 11 echte Worker-/D1-Integrationstests erfolgreich.
- `pnpm --filter @skiurlaub/mobile test:e2e`: 16 Tests erfolgreich, Handy und
  Tablet; Navigation, lokaler Login, Fehlerzustände, beschädigte Daten,
  veralteter Cache, Theme-Persistenz, Prognose und eigene Kartenansicht.
  Testserver nutzt isoliertes Miniflare/D1; keine produktive Anmeldung getestet.
- `pnpm android:install`: Debug-APK gebaut, auf Samsung SM-S918B installiert
  und geöffnet. Android 17, Gerät mit freigegebenem USB-Debugging.
- `pnpm android:smoke`: Hell/Dunkel, Profil, kein lokaler Testlogin auf Gerät,
  kein horizontaler Überlauf, native Zurück-Taste schließt Daten-/Prognosedetails,
  Kartenbildschirm öffnet und kehrt zurück, Start-Zurück minimiert die App.
- Aufklappzustand mit CDP-Animationsgeschwindigkeit 10 % kontrolliert:
  Chevron dreht sich im Kontext; der Inhalt erscheint ohne dekorative
  Einblendfolge. Screenshot `artifacts/android-disclosure-slow.png`.
- Gerätescreenshots und Ergebnisse in `artifacts/android-home-device.png`,
  `artifacts/android-profile-light.png`, `artifacts/android-profile-dark.png`,
  `artifacts/android-smoke.json` (lokale, nicht eingecheckte Artefakte).

**Nicht verifiziert:** TalkBack, alle erhöhten Android-Schrift-/Displaygrößen,
echtes Tablet/Foldable, Android-Versionen vor dem Testgerät, produktive Anmeldung und
Predictive-Back-Vorschau. Keine dynamischen Wallpaper-Farben implementiert.

**Verdict: Needs changes für eine vollständige Designabnahme.** Keine bekannte
blockierende Designstörung verbleibt; die ausdrücklich oben genannten offenen
Zugänglichkeits- und Geräteprüfungen stehen noch aus. Die neue Fassung ist als
auf dem Handy installierter, prüfbarer Android-Entwurf bereit.

## Folgeanpassung: weniger Gewicht auf Dekoration und Metadaten

Auf Benutzerfreigabe wurden die fünf vorgeschlagenen Änderungen umgesetzt.
Modus weiterhin **full**, gleiche Framework-/Styling-Grenzen wie oben.

| Kategorie   | Neue Prüfung                                       | Ergebnis                                                                  |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Typography  | App-Bar, Uhrzeiten, leere Seiten und Profil        | Ein Titel; kürzere Texte, Reisedatum als Unterzeile                       |
| Surfaces    | Wetter, Navigation, Profil/Skipässe                | Kleinere neutrale Wetterfläche, vier Ziele, Konto ohne große äußere Karte |
| Animations  | Aufklappzustand und native Zurück-Navigation       | Keine neue Bewegung; bestehende 10%-Prüfung im Gerätetest erhalten        |
| Icons       | Vier Navigationseinträge, Profil-Link zu Skipässen | Bestehende Icons wiederverwendet; kein dekoratives Leerzustands-Icon      |
| Performance | Entfernte Reise-Sektion und zugehöriges CSS        | Bestehende Komponenten verschoben; keine neue Abhängigkeit                |

| Severity | Location                                                                                                                                                         | Before                                               | After                                                                                                               | Why                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| MEDIUM   | `apps/mobile/src/components/layout/AppLayout.tsx:1`, `apps/mobile/src/app/ProfilePage.tsx:1`, `apps/mobile/src/app/NativeLifecycle.tsx:1`                        | Fünf gleichrangige Ziele                             | Vier Ziele; Skipässe im Profil, Profil bleibt aktiv und Android-Zurück führt dorthin                                | Klare Navigationshierarchie und zugängliche Kennzeichnung                         |
| MEDIUM   | `apps/mobile/src/components/layout/TripHeader.tsx:1`, `apps/mobile/src/app/HomePage.tsx:1`                                                                       | App-Titel plus separater Reiseblock                  | Reiseziel, Datum und kleiner Tageshinweis direkt in der App-Bar                                                     | Weniger Wiederholung und schnellerer Zugriff auf Nutzdaten                        |
| MEDIUM   | `apps/mobile/src/components/dashboard/DashboardPreview.tsx:1`, `apps/mobile/src/styles/app.css:1`                                                                | Stark gefärbte Wetterfläche, große Temperatur        | Neutrale kleinere Fläche, 32px-Temperatur und -Icon                                                                 | Lifte und Kartenaktion rücken nach oben                                           |
| MEDIUM   | `apps/mobile/src/components/dashboard/DashboardStatus.tsx:1`, `apps/mobile/src/components/forecast/ForecastPreview.tsx:1`, `apps/mobile/src/data/date-time.ts:1` | Anbieter, Lizenz und volle Zeitangaben im Hauptfluss | Uhrzeit auf Start; Anbieter/Lizenzen unter Datenstand, Modellkennzeichnung und Veraltet-Hinweise weiterhin sichtbar | Weniger Metadaten ohne Verlust der Quellenklarheit; alte Daten behalten das Datum |
| LOW      | `apps/mobile/src/app/EmptyPage.tsx:1`, `apps/mobile/src/app/ProfilePage.tsx:1`, `apps/mobile/src/app/App.tsx:1`                                                  | Große Leerzustände und wiederholende Erklärungen     | Kurze Texte ohne große Symbol-/Kartenfläche                                                                         | Noch fehlende Funktionen nehmen weniger Raum ein                                  |

Zusätzlich erwogen: Skipässe entfernen (verworfen, vorhandener Bereich bleibt
erreichbar), Wetter vollständig ausblenden (verworfen, zentraler Reiseinhalt),
Quellenhinweise entfernen (verworfen, Herkunft und Modellcharakter bleiben wichtig).

Prüfung dieser Anpassung: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
35 React-/Datumsformat-Tests, 16 Handy-/Tablet-Oberflächentests, Android-Build
und `pnpm android:smoke`. Gerätetest ergänzt vier Ziele, Skipässe aus dem Profil
und native Zurück-Taste zum Profil. Aktuelle Screenshots liegen weiterhin unter
`artifacts/`. Das vollständige Datum veralteter Quellen bleibt getestet.

Verdict für die Umsetzung: **Approve**, keine bekannten offenen Designbefunde
innerhalb dieser fünf Anpassungen. Weiterhin **nicht verifiziert**: TalkBack,
erhöhte Android-Systemschrift-/Displaygrößen und echtes Tablet/Foldable.

## Pull-to-Refresh

Modus **full**, Scope: Aktualisierungsgeste im gemeinsamen App-Inhalt, ohne
neue UI-Abhängigkeit. Bestehendes React/CSS- und TanStack-Query-System.

| Kategorie   | Geprüfte Evidenz                                           | Ergebnis                                                                          |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Typography  | Ziehen-/Loslassen-, Lade-, Fehler- und Wartezeittexte      | Kurze 14px-Rückmeldung, Live-Region für Status                                    |
| Surfaces    | `PullToRefresh.tsx`, Android-Wisch, CSS                    | Kompakter tonaler Hinweis unter der App-Bar; kein Verschieben des Inhalts         |
| Animations  | Widerstand der Zugstrecke, Ladezustand, Reduced-Motion-CSS | Keine Einblendfolge; Spinner nur während einer Abfrage                            |
| Icons       | Bestehendes RefreshCw, currentColor, 1.8px                 | Einheitlich mit der vorhandenen Oberfläche                                        |
| Performance | Aktive Queries, gleichzeitige Gesten, Provider-Cache       | Abfragen gebündelt, keine parallelen Refreshes; Quellenpause und Backoff erhalten |

| Severity | Location                                                                                                     | Before                                                              | After                                                                                                | Why                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| MEDIUM   | `apps/mobile/src/components/layout/PullToRefresh.tsx:1`, `apps/mobile/src/components/layout/AppLayout.tsx:1` | Aktualisierung nur über Datenstand-Schaltflächen                    | Am Seitenanfang ziehen/loslassen; Status und zugängliche Tastatur-/Screenreader-Aktion               | Übliches mobiles Interaktionsmuster, zusätzliche Bedienmöglichkeit bleibt erhalten |
| MEDIUM   | `apps/mobile/src/data/refresh.ts:1`, `apps/mobile/src/hooks/useRemoteResource.ts:1`                          | Ein normales Refetch konnte frische Provider-Caches wiederverwenden | Explizite Invalidierung umgeht den Provider-Cache, berücksichtigt Mindestpause und meldet Teilfehler | Keine scheinbare Aktualisierung; vorhandene Daten bleiben bei Fehlern erhalten     |

Erwogen und verworfen: vollständiger App-Reload (verliert den Ansichtszustand),
zusätzliche Pull-to-Refresh-Bibliothek/native Bridge (vorhandene Touch- und
Query-APIs reichen für diese einzelne Interaktion aus).

Verifiziert: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, 43 Unit-Tests
und 18 Oberflächentests. Letztere prüfen tatsächliche zusätzliche Anfragen an
beide gemockten Quellen nach Ablauf der Mindestpause. `pnpm android:install`
und `pnpm android:smoke` erfolgreich; echter ADB-Touch-Wisch auf dem Samsung
löst die Rückmeldung aus. Geprüft sind außerdem zu kurze/horizontale Züge,
Zurückziehen, Abbruch, Kartenberührung, Scrollposition, parallele Gesten,
Offline-Fehler, Cache-Rückfälle und aktive persönliche Abfragen.

Verdict: **Approve** für den implementierten Umfang. **Nicht verifiziert:**
TalkBack auf dem Gerät, Zeitlupenprüfung des neuen Lade-Spinners und echte
Statistikdaten (noch nicht angebunden). Vorhandene persönliche Abfragen werden
vom Aktualisierungsmechanismus bereits erfasst.
