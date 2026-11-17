# Android-Umstellung

Stand: 17.11.2026. Auf Benutzerwunsch ersetzt Android die bisherige Website
als Produktziel. Stack: React, TypeScript, Capacitor 8; die Oberfläche läuft
lokal in einer Android-WebView. Jetpack Compose ist nicht Teil dieses Stacks.

## Umsetzung

- `apps/web` wurde zu `apps/mobile`; API und gemeinsame Schemas bleiben erhalten.
- Das eingecheckte Android-Projekt verwendet SDK 36, mindestens Android 7 (24)
  und JDK 21. Capacitor enthält die gebauten Assets; keine externe Website wird
  zur Laufzeit als App geladen, kein Entwicklungsserver ist erforderlich.
- Oberfläche vollständig neu aufgebaut gemäß den Android-Designrichtlinien:
  kompakte App-Bar, gruppierte Listen, Karte als eigener Bildschirm,
  untere Navigation unter 600px, Rail ab 600px, 48px-Berührungsflächen.
  Neue semantische Farbrollen in Gletscherblau und Anthrazit mit Hell/Dunkel/System.
  Kein Foto-Hero, keine großen Countdown-Kacheln oder Website-Fußzeile.
  [Designprüfung und Quellen](android-design-review.md).
- Systemleisten und Displayausschnitte werden über Capacitor-SystemBars und
  CSS-Inset-Variablen berücksichtigt. Grundlage:
  [offizielle SystemBars-Dokumentation](https://next.capacitorjs.com/docs/apis/system-bars).
- Android-Zurück schließt Prognosedetails/Anmeldeschritte, anschließend offene
  Datenstand-Details, führt von Unterseiten zu Home und minimiert dort die App.
- Externe HTTPS-Links öffnen Android Custom Tabs. App-Rückkehr aktualisiert
  aktive Datenabfragen. Splashscreen wird nach Mounten der Oberfläche ausgeblendet.
- Eigene Berggrafik als Android-Icon und Splashscreen, ohne Rastergenerator.
- `pnpm android:build` erzeugt `artifacts/skiurlaub-debug.apk`;
  `pnpm android:install` installiert per ADB mit Datenerhalt und öffnet die App.
  Debug hat die separate ID `cc.quxx.skiurlaub.debug`.

## Zum Aktualisieren ziehen

Am Seitenanfang nach unten ziehen und loslassen: Die aktiven Wetter-/Lift-
und persönlichen Datenabfragen werden neu geladen. Auf Kartenflächen,
Formularfeldern, Links und innerhalb verschachtelter Scrollflächen greift die
Geste nicht ein. Ein Ladehinweis bestätigt die Aktion; Offline- und Teilfehler
werden gemeldet, vorhandene Werte bleiben erhalten. Als Alternative steht die
Aktion „Daten aktualisieren“ per Tastatur/Screenreader zur Verfügung.

Die vorhandene Mindestpause von einer Minute pro Wetter-/Liftquelle und
Anbieter-Backoff bleiben wirksam. Nach Ablauf wird der Provider-Cache bei der
Aktualisierung umgangen. Persönliche Statistiken sind noch nicht implementiert;
aktive persönliche Abfragen werden bereits vom gleichen Mechanismus erfasst.

## Noch offen

Produktionsanbindung der Authentifizierung, Skiline-Freigabe,
GPS-Aufzeichnung, NFC und Play-Store-Release gehören zu späteren Schritten.
Die native Sitzungsanbindung mit Keystore und eigenem HTTP-Transport wurde in
[Phase 3](phase-3-auth-decision.md) ergänzt und lokal auf dem Gerät geprüft.
`VITE_API_BASE_URL` muss auf das freigegebene HTTPS-Backend zeigen.
Keine Zugangsdaten im Bundle; die produktive Anbindung steht noch aus.
Die aktuelle APK zeigt die persönlichen Bereiche entsprechend als nicht aktiviert.

Wetter, Drittanbieterstatus und Kartentiles benötigen Internet. Die Oberfläche
ist lokal enthalten; vollständige Offline-Karten sind noch nicht implementiert.
Keine zusätzlichen GPS-/NFC-Berechtigungen wurden vorsorglich angefordert.

Historische Phasendokumente bleiben zur Nachvollziehbarkeit erhalten und
beschreiben teilweise die inzwischen abgelöste Web-Zielarchitektur.
